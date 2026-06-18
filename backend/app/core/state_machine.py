from __future__ import annotations

from enum import Enum
from typing import Optional


class ConversationState(str, Enum):
    IDLE = "idle"
    SCENE_IDENTIFYING = "scene_identifying"
    ASKING = "asking"
    ANSWERING = "answering"
    INTEGRATING = "integrating"
    CONFIRMING = "confirming"
    PRD_GENERATING = "prd_generating"
    COMPLETED = "completed"


COMPLETION_THRESHOLD = 80
MAX_TO_CONFIRM = 1


def calc_completion(doc: Optional[dict]) -> int:
    """业务确认稿完成度（按维度加权 + 数量部分积分）。

    6 个维度 + 权重（总分 100）：
    - scene             20 pts  text 字段（满：非空；否则 0）
    - background        15 pts  text 字段
    - roles             15 pts  list 字段（1 个 1/3，2 个 2/3，3+ 满分）
    - pain_points       15 pts  list 字段
    - expected_outcomes 20 pts  list 字段
    - key_scenarios     15 pts  list 字段

    list 字段：
    - 0 个有效条目 → 0 分
    - 1 个有效条目 → 1/3 权重
    - 2 个有效条目 → 2/3 权重
    - 3+ 个有效条目 → 满分
    - "有效" 定义为该条目的核心字段（如 roles.name / pain_points.description）
      有非空字符串内容（去除空白后）

    text 字段：
    - 空字符串 → 0 分
    - 有内容 → 满分

    to_confirm 列表中标记的字段会被排除（避免"待确认"的字段被算完成）。
    """
    if not doc:
        return 0

    weights = {
        "scene": 20,
        "background": 15,
        "roles": 15,
        "pain_points": 15,
        "expected_outcomes": 20,
        "key_scenarios": 15,
    }
    list_primary_keys = {
        "roles": "name",
        "pain_points": "description",
        "expected_outcomes": "description",
        "key_scenarios": "description",
    }
    to_confirm = set(doc.get("to_confirm") or [])

    score = 0
    for field, weight in weights.items():
        if field in to_confirm:
            continue
        value = doc.get(field)
        if field in list_primary_keys:
            key = list_primary_keys[field]
            valid = sum(1 for item in (value or []) if (item.get(key) or "").strip())
            if valid == 0:
                pts = 0
            elif valid == 1:
                pts = weight // 3
            elif valid == 2:
                pts = (weight * 2) // 3
            else:
                pts = weight
        else:
            pts = weight if (value or "").strip() else 0
        score += pts
    return min(score, 100)


def should_continue(doc: Optional[dict]) -> bool:
    if not doc:
        return True
    completion = calc_completion(doc)
    to_confirm = doc.get("to_confirm") or []
    if completion >= COMPLETION_THRESHOLD and len(to_confirm) <= MAX_TO_CONFIRM:
        return False
    return True


class StateMachine:
    """对话状态机。

    唯一允许修改 `state` 的方式是 `transition(event)`。
    直接赋值 `sm.state = X` 会被拒绝 — 这保证了状态机的合约真的被 enforce。
    """

    def __init__(
        self,
        state: str = ConversationState.IDLE.value,
        round: int = 0,
        completion: int = 0,
    ):
        # 用 object.__setattr__ 绕过我们自己的 __setattr__ 拦截
        object.__setattr__(self, "state", ConversationState(state))
        object.__setattr__(self, "round", round)
        object.__setattr__(self, "completion", completion)

    def __setattr__(self, name: str, value) -> None:
        if name == "state":
            raise AttributeError(
                "StateMachine.state 是只读的,使用 transition(event) 改变状态。"
            )
        object.__setattr__(self, name, value)

    def _set_state(self, new_state: ConversationState) -> None:
        """内部 setter:在 transition() 内部使用,绕过 __setattr__ 拦截。"""
        object.__setattr__(self, "state", new_state)

    def transition(self, event: str) -> ConversationState:
        cur = self.state

        if cur == ConversationState.IDLE and event == "first_message":
            self._set_state(ConversationState.SCENE_IDENTIFYING)
            self.round = 1

        elif cur == ConversationState.SCENE_IDENTIFYING and event == "scene_identified":
            self._set_state(ConversationState.ASKING)

        elif cur == ConversationState.ASKING and event == "user_answered":
            self._set_state(ConversationState.ANSWERING)

        elif cur == ConversationState.ANSWERING and event == "llm_returned":
            self._set_state(ConversationState.INTEGRATING)

        elif cur == ConversationState.INTEGRATING and event == "integrated":
            self.round += 1
            self._set_state(ConversationState.ASKING)

        # 用户主动结束反问 → 进入确认阶段
        elif (
            cur in (ConversationState.ASKING, ConversationState.INTEGRATING)
            and event == "user_finished"
        ):
            self._set_state(ConversationState.CONFIRMING)

        # 系统强制进入确认阶段(例如满足 completion 阈值)
        elif event == "force_confirming":
            self._set_state(ConversationState.CONFIRMING)

        elif cur == ConversationState.CONFIRMING and event == "user_confirmed":
            self._set_state(ConversationState.PRD_GENERATING)

        elif cur == ConversationState.PRD_GENERATING and event == "prd_generated":
            self._set_state(ConversationState.COMPLETED)

        elif event == "async_supplement":
            self._set_state(ConversationState.INTEGRATING)

        return self.state