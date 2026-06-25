from app.services.signal_extractor import (
    extract_frequency,
    extract_severity,
    extract_explicit,
    extract_role_confidence,
    enrich_doc_tags,
)


class TestFrequency:
    def test_high_signals(self):
        assert extract_frequency("我们每天发货 50 台").value == "高频"
        assert extract_frequency("天天出问题").value == "高频"
        assert extract_frequency("客户经常投诉").value == "高频"
        assert extract_frequency("这事总是发生").value == "高频"

    def test_mid_signals(self):
        assert extract_frequency("有时会遇到这个问题").value == "中频"
        assert extract_frequency("客户偶尔抱怨").value == "中频"

    def test_low_signals(self):
        assert extract_frequency("很少遇到").value == "低频"
        assert extract_frequency("极少发生").value == "低频"

    def test_no_signal_returns_none(self):
        ext = extract_frequency("客户体验不好")
        assert ext.value is None
        assert ext.extracted is False

    def test_evidence_recorded(self):
        ext = extract_frequency("我们每天发货 50 台")
        assert ext.evidence == "每天"
        assert ext.extracted is True


class TestSeverity:
    def test_severe_signals(self):
        assert extract_severity("这导致我们损失大量客户").value == "严重"
        assert extract_severity("客户非常不满").value == "严重"
        assert extract_severity("这非常严重").value == "严重"
        assert extract_severity("客户都流失了").value == "严重"

    def test_moderate_signals(self):
        assert extract_severity("有点影响").value == "一般"
        assert extract_severity("稍微麻烦一点").value == "一般"

    def test_mild_signals(self):
        assert extract_severity("轻微影响").value == "轻微"
        assert extract_severity("问题不大, 可以接受").value == "轻微"

    def test_no_signal(self):
        ext = extract_severity("我们需要这个功能")
        assert ext.value is None
        assert ext.extracted is False


class TestExplicit:
    def test_true_signals(self):
        ext = extract_explicit("我希望系统能自动核对数量")
        assert ext.value is True
        assert ext.evidence == "希望"

        ext = extract_explicit("必须要做这个功能")
        assert ext.value is True

    def test_false_signals(self):
        ext = extract_explicit("如果可以做就更好了")
        assert ext.value is False
        assert ext.evidence in ("如果可以", "如果要做")

    def test_no_signal(self):
        ext = extract_explicit("系统现在有问题")
        assert ext.value is None


class TestRoleConfidence:
    def test_self_reference_high(self):
        role = {"name": "客户经理"}
        ext = extract_role_confidence(role, "我是客户经理, 每天跟进 20 个客户")
        assert ext.value == "high"
        assert ext.evidence in ("我是", "我")

    def test_team_reference_high(self):
        role = {"name": "销售"}
        ext = extract_role_confidence(role, "我们销售团队负责跟进客户")
        assert ext.value == "high"

    def test_named_mention_medium(self):
        role = {"name": "产品经理"}
        ext = extract_role_confidence(role, "产品经理反馈说这个功能需要做")
        assert ext.value == "medium"

    def test_no_mention_low(self):
        role = {"name": "财务"}
        ext = extract_role_confidence(role, "客户那边遇到问题, 大家都觉得麻烦")
        assert ext.value == "low"
        assert ext.evidence is None


class TestEnrichDoc:
    def test_fills_missing_frequency(self):
        doc = {
            "pain_points": [
                {"description": "发货数量出错", "frequency": None, "severity": None}
            ],
            "to_confirm": [],
        }
        out = enrich_doc_tags(doc, "我们每天发货 50 台, 经常出错, 客户都流失了")
        assert out["pain_points"][0]["frequency"] == "高频"
        assert out["pain_points"][0]["evidence"]["frequency"] == "每天"
        assert out["pain_points"][0]["severity"] == "严重"
        assert out["pain_points"][0]["evidence"]["severity"] in ("流失", "严重", "很", "影响复购", "影响客户")

    def test_skips_in_to_confirm(self):
        doc = {
            "pain_points": [
                {"description": "待确认的痛点", "frequency": None, "severity": None}
            ],
            "to_confirm": ["pain_points[0]"],
        }
        out = enrich_doc_tags(doc, "每天出错")
        assert out["pain_points"][0]["frequency"] is None
        assert out["pain_points"][0]["severity"] is None

    def test_keeps_existing_with_evidence(self):
        doc = {
            "pain_points": [
                {
                    "description": "发货出错",
                    "frequency": "中频",
                    "severity": "轻微",
                    "evidence": {"frequency": "偶尔", "severity": "轻微"},
                }
            ],
            "to_confirm": [],
        }
        out = enrich_doc_tags(doc, "每天出错, 损失很大")
        assert out["pain_points"][0]["frequency"] == "中频"
        assert out["pain_points"][0]["severity"] == "轻微"

    def test_overrides_existing_without_evidence(self):
        doc = {
            "pain_points": [
                {"description": "发货出错", "frequency": "未知", "severity": "严重"}
            ],
            "to_confirm": [],
        }
        out = enrich_doc_tags(doc, "每天发货 50 台出错")
        assert out["pain_points"][0]["frequency"] == "高频"
        assert out["pain_points"][0]["evidence"]["frequency"] == "每天"

    def test_explicit_extraction(self):
        doc = {
            "expected_outcomes": [
                {"description": "系统能自动核对数量", "explicit": None}
            ],
            "to_confirm": [],
        }
        out = enrich_doc_tags(doc, "我希望发货时系统能自动核对数量对不对")
        assert out["expected_outcomes"][0]["explicit"] is True
        assert out["expected_outcomes"][0]["evidence"]["explicit"] == "希望"

    def test_role_confidence_extraction(self):
        doc = {
            "roles": [
                {"name": "客户经理", "responsibility": "跟进续费", "confidence": None}
            ],
            "to_confirm": [],
        }
        out = enrich_doc_tags(doc, "我是客户经理, 每天跟进 20 个客户")
        assert out["roles"][0]["confidence"] == "high"

    def test_empty_input_keeps_none(self):
        doc = {
            "pain_points": [{"description": "出问题", "frequency": None, "severity": None}],
            "expected_outcomes": [{"description": "想要更好", "explicit": None}],
            "roles": [{"name": "客户经理", "confidence": None}],
            "to_confirm": [],
        }
        out = enrich_doc_tags(doc, "")
        assert out["pain_points"][0]["frequency"] is None
        assert out["pain_points"][0]["severity"] is None
        assert out["expected_outcomes"][0]["explicit"] is None
        assert out["roles"][0]["confidence"] is None