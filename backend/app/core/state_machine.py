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
    def __init__(self, state: str = ConversationState.IDLE.value, round: int = 0, completion: int = 0):
        self.state = ConversationState(state)
        self.round = round
        self.completion = completion

    def transition(self, event: str) -> ConversationState:
        cur = self.state

        if cur == ConversationState.IDLE and event == "first_message":
            self.state = ConversationState.SCENE_IDENTIFYING
            self.round = 1

        elif cur == ConversationState.SCENE_IDENTIFYING and event == "scene_identified":
            self.state = ConversationState.ASKING

        elif cur == ConversationState.ASKING and event == "user_answered":
            self.state = ConversationState.ANSWERING

        elif cur == ConversationState.ANSWERING and event == "llm_returned":
            self.state = ConversationState.INTEGRATING

        elif cur == ConversationState.INTEGRATING and event == "integrated":
            self.round += 1
            self.state = ConversationState.ASKING

        elif cur == ConversationState.CONFIRMING and event == "user_confirmed":
            self.state = ConversationState.PRD_GENERATING

        elif cur == ConversationState.PRD_GENERATING and event == "prd_generated":
            self.state = ConversationState.COMPLETED

        elif event == "async_supplement":
            self.state = ConversationState.INTEGRATING

        return self.state