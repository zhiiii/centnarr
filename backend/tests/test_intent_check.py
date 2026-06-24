"""意图识别单元测试。"""
from app.services.intent_check import check_relevance, build_refusal_message


def test_greeting_rejected():
    r = check_relevance("你好", context_summary="仓库发货管理", recent_user_messages=["我想做一个发货系统"])
    assert r.relevant is False
    assert r.matched_pattern == "greeting"


def test_greeting_with_punct_rejected():
    r = check_relevance("您好！", context_summary="仓库发货管理", recent_user_messages=[])
    assert r.relevant is False
    assert r.matched_pattern == "greeting"


def test_identity_question_rejected():
    r = check_relevance("你是谁", context_summary="提需", recent_user_messages=[])
    assert r.relevant is False
    assert r.matched_pattern == "identity_question"


def test_weather_smalltalk_rejected():
    r = check_relevance("今天天气怎么样", context_summary="提需", recent_user_messages=[])
    assert r.relevant is False


def test_test_input_rejected():
    r = check_relevance("test", context_summary="提需", recent_user_messages=[])
    assert r.relevant is False
    assert r.matched_pattern == "test_input"


def test_gibberish_rejected():
    r = check_relevance("asdfasdf", context_summary="提需", recent_user_messages=[])
    assert r.relevant is False
    assert r.matched_pattern == "gibberish"


def test_pure_punct_rejected():
    r = check_relevance("...", context_summary="提需", recent_user_messages=[])
    assert r.relevant is False


def test_coding_request_rejected():
    r = check_relevance("帮我写个贪吃蛇", context_summary="仓库发货管理", recent_user_messages=[])
    assert r.relevant is False
    assert r.matched_pattern == "coding_request"


def test_math_only_rejected():
    r = check_relevance("1+1=?", context_summary="提需", recent_user_messages=[])
    assert r.relevant is False
    assert r.matched_pattern == "math_question"


def test_emoji_only_rejected():
    r = check_relevance("😂😂😂", context_summary="提需", recent_user_messages=[])
    assert r.relevant is False


def test_empty_rejected():
    r = check_relevance("", context_summary="提需", recent_user_messages=[])
    assert r.relevant is False
    assert r.matched_pattern == "empty"


def test_short_meaningless_rejected():
    r = check_relevance("啊", context_summary="仓库发货管理", recent_user_messages=["我想做一个发货系统"])
    assert r.relevant is False


def test_relevant_expansion_accepted():
    r = check_relevance(
        "我希望发货时能自动核对数量对不对",
        context_summary="仓库发货管理",
        recent_user_messages=["我想做一个仓库发货系统"],
    )
    assert r.relevant is True


def test_relevant_question_answer_accepted():
    r = check_relevance(
        "客户收到货发现数量对不上时, 客服会先接电话",
        context_summary="仓库发货管理",
        recent_user_messages=[
            "我想做一个仓库发货系统",
            "客户发现错误后谁先处理？",
        ],
    )
    assert r.relevant is True


def test_first_message_accepted():
    r = check_relevance(
        "我想开发一个仓库发货管理系统, 解决客户收货对不上的问题",
        context_summary="",
        recent_user_messages=[],
    )
    assert r.relevant is True


def test_irrelevant_against_context_rejected():
    r = check_relevance(
        "今天中午吃什么好呢",
        context_summary="仓库发货管理",
        recent_user_messages=["我想做一个仓库发货系统"],
    )
    assert r.relevant is False


def test_refusal_message_includes_topic():
    msg = build_refusal_message("命中规则", "仓库发货管理")
    assert "仓库发货管理" in msg
    assert "场景" in msg or "角色" in msg


def test_refusal_message_without_topic():
    msg = build_refusal_message("命中规则", "")
    assert "需求" in msg
