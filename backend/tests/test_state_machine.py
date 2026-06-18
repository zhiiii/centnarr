from app.core.state_machine import (
    COMPLETION_THRESHOLD,
    ConversationState,
    StateMachine,
    calc_completion,
    should_continue,
)


def test_initial_state():
    sm = StateMachine()
    assert sm.state == ConversationState.IDLE
    assert sm.round == 0
    assert sm.completion == 0


def test_normal_flow():
    sm = StateMachine()
    sm.transition("first_message")
    assert sm.state == ConversationState.SCENE_IDENTIFYING
    assert sm.round == 1

    sm.transition("scene_identified")
    assert sm.state == ConversationState.ASKING

    sm.transition("user_answered")
    assert sm.state == ConversationState.ANSWERING

    sm.transition("llm_returned")
    assert sm.state == ConversationState.INTEGRATING

    sm.completion = 85
    sm.transition("integrated")
    assert sm.state == ConversationState.ASKING
    assert sm.round == 2

    sm.state = ConversationState.CONFIRMING
    sm.transition("user_confirmed")
    assert sm.state == ConversationState.PRD_GENERATING

    sm.transition("prd_generated")
    assert sm.state == ConversationState.COMPLETED


def test_asking_to_answering():
    """业务人员发回答后，状态应从 ASKING 进入 ANSWERING（AI 在想）。"""
    sm = StateMachine(state=ConversationState.ASKING.value, round=2)
    sm.transition("user_answered")
    assert sm.state == ConversationState.ANSWERING


def test_answering_to_integrating():
    """LLM 返回后，状态应从 ANSWERING 进入 INTEGRATING。"""
    sm = StateMachine(state=ConversationState.ANSWERING.value, round=2)
    sm.transition("llm_returned")
    assert sm.state == ConversationState.INTEGRATING


def test_full_chat_chain_8_states():
    """完整聊天链路覆盖全部 8 个状态。"""
    sm = StateMachine()
    assert sm.state == ConversationState.IDLE  # 1

    sm.transition("first_message")
    assert sm.state == ConversationState.SCENE_IDENTIFYING  # 2

    sm.transition("scene_identified")
    assert sm.state == ConversationState.ASKING  # 3

    sm.transition("user_answered")
    assert sm.state == ConversationState.ANSWERING  # 4

    sm.transition("llm_returned")
    assert sm.state == ConversationState.INTEGRATING  # 5

    sm.completion = 85
    sm.transition("integrated")
    assert sm.state == ConversationState.ASKING  # 回到 ASKING，等业务人员再答

    sm.state = ConversationState.CONFIRMING  # 6 (业务人员主动 finish)
    sm.transition("user_confirmed")
    assert sm.state == ConversationState.PRD_GENERATING  # 7

    sm.transition("prd_generated")
    assert sm.state == ConversationState.COMPLETED  # 8


def test_low_completion_loops_back():
    sm = StateMachine()
    sm.transition("first_message")
    sm.transition("scene_identified")
    sm.transition("user_answered")
    sm.transition("llm_returned")
    sm.completion = 30
    sm.transition("integrated")
    assert sm.state == ConversationState.ASKING


def test_integrated_stays_in_asking():
    sm = StateMachine()
    sm.transition("first_message")
    sm.transition("scene_identified")
    sm.transition("user_answered")
    sm.transition("llm_returned")
    sm.completion = 85
    sm.transition("integrated")
    assert sm.state == ConversationState.ASKING
    assert sm.round == 2


def test_async_supplement():
    sm = StateMachine(state=ConversationState.ASKING.value, round=2)
    sm.transition("async_supplement")
    assert sm.state == ConversationState.INTEGRATING


def test_async_supplement_from_answering():
    """异步补充事件也可以从 ANSWERING 状态触发，跳过中间转移。"""
    sm = StateMachine(state=ConversationState.ANSWERING.value, round=2)
    sm.transition("async_supplement")
    assert sm.state == ConversationState.INTEGRATING


def test_calc_completion():
    assert calc_completion({}) == 0

    doc = {
        "scene": "仓库发货数量对不上",
        "background": "每月 3-5 次出错",
        "roles": [{"name": "仓库"}],
        "pain_points": [{"description": "客户收货对不上"}],
        "expected_outcomes": [{"description": "快速处理"}],
        "key_scenarios": [{"description": "100 台只收到 80 台"}],
    }
    completion = calc_completion(doc)
    assert completion >= 80


def test_should_continue():
    assert should_continue({}) is True
    doc = {
        "scene": "x",
        "background": "x",
        "roles": [{"name": "x"}],
        "pain_points": [{"description": "x"}],
        "expected_outcomes": [{"description": "x"}],
        "key_scenarios": [{"description": "x"}],
        "to_confirm": [],
    }
    assert should_continue(doc) is False