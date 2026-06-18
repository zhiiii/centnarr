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
    if not doc:
        return 0
    if (doc.get("scene") or "").strip():
        score = 20
    else:
        score = 0

    expected_outcomes = doc.get("expected_outcomes") or []
    if any((e.get("description") or "").strip() for e in expected_outcomes):
        score += 20

    roles = doc.get("roles") or []
    if any((r.get("name") or "").strip() for r in roles):
        score += 15

    pain_points = doc.get("pain_points") or []
    if any((p.get("description") or "").strip() for p in pain_points):
        score += 15

    key_scenarios = doc.get("key_scenarios") or []
    if any((s.get("description") or "").strip() for s in key_scenarios):
        score += 15

    background = (doc.get("background") or "").strip()
    if background:
        score += 15

    return min(100, score)


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