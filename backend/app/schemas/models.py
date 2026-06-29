from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


class StartConversationRequest(BaseModel):
    user_id: str = "anonymous"
    project_id: Optional[str] = None


class StartConversationResponse(BaseModel):
    conversation_id: str
    state: str
    title: Optional[str] = None
    created_at: str


class MessageRequest(BaseModel):
    conversation_id: str
    content: str
    input_type: str = "text"
    meta: Optional[dict] = None


class RespondRequest(BaseModel):
    conversation_id: str
    content: str
    input_type: str = "text"
    meta: Optional[dict] = None
    is_async_supplement: bool = False


class QuestionItem(BaseModel):
    id: str
    dimension: str = "补全信息"
    question: str = ""
    why: str = ""
    examples: list[str] = Field(default_factory=list)
    my_understanding: Optional[str] = None
    confirm_with_businessperson: Optional[str] = None
    guide_to_say_more: Optional[str] = None


class SceneAnalysis(BaseModel):
    scene: str
    roles: list[dict] = Field(default_factory=list)
    pain_points: list[dict] = Field(default_factory=list)
    expected_outcomes: list[dict] = Field(default_factory=list)
    emotional_signal: str = "平静"
    urgency: str = "中"
    summary: str = ""


class QuestionGeneration(BaseModel):
    questions: list[QuestionItem]
    emotional_care: Optional[str] = None
    should_continue: bool = True
    reason_to_continue: Optional[str] = None


class MessageTurn(BaseModel):
    role: str
    content: str
    input_type: str = "text"
    meta: Optional[dict] = None
    created_at: str


class DocView(BaseModel):
    scene: str = ""
    background: str = ""
    roles: list[dict] = Field(default_factory=list)
    pain_points: list[dict] = Field(default_factory=list)
    expected_outcomes: list[dict] = Field(default_factory=list)
    key_scenarios: list[dict] = Field(default_factory=list)
    to_confirm: list[str] = Field(default_factory=list)


class ConversationView(BaseModel):
    conversation_id: str
    state: str
    title: Optional[str] = None
    current_round: int
    completion: int
    messages: list[MessageTurn] = Field(default_factory=list)
    doc: DocView
    communication_cards: list[dict] = Field(default_factory=list)
    has_prd: bool = False
    requirement_id: Optional[str] = None
    requirement_status: Optional[str] = None


class ConfirmRequest(BaseModel):
    conversation_id: str


class ConfirmResponse(BaseModel):
    conversation_id: str
    requirement_id: str
    state: str
    doc: DocView


class PrdResponse(BaseModel):
    prd_id: str
    requirement_id: str
    content: str
    title: str
    version: str = "v1.0"
    created_at: str


class ExportRequest(BaseModel):
    prd_id: str
    format: str = "markdown"


class ExportResponse(BaseModel):
    filename: str
    content: str
    mime_type: str


class RequirementListItem(BaseModel):
    id: str
    conversation_id: str
    title: str
    status: str
    updated_at: str


class RequirementListResponse(BaseModel):
    items: list[RequirementListItem]
    total: int
    page: int
    page_size: int


class DocEditRequest(BaseModel):
    field_path: str
    value: Any

    @field_validator("value")
    @classmethod
    def value_not_null(cls, v: Any) -> Any:
        if v is None:
            raise ValueError("value 不能为 null；如需清空请传空字符串")
        return v


class DocEditResponse(BaseModel):
    doc: DocView
    completion: int
    version_id: str


class UploadResponse(BaseModel):
    file_id: str
    file_url: str
    file_type: str
    extracted_text: Optional[str] = None
    size: int


class PrdEditRequest(BaseModel):
    content: str


class PrdEditResponse(BaseModel):
    prd_id: str
    content: str
    version: str
    updated_at: str


class PrdAcceptanceRequest(BaseModel):
    checks: dict


class PrdAcceptanceResponse(BaseModel):
    prd_id: str
    acceptance_state: dict
    updated_at: str


class ProjectCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    team_id: Optional[str] = None


class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    requirement_count: int = 0
    prd_count: int = 0
    created_at: str
    updated_at: str


class ProjectRequirementItem(BaseModel):
    id: str
    title: str
    status: str
    updated_at: str
    prd_count: int = 0


class ProjectDetailResponse(ProjectResponse):
    requirements: list[ProjectRequirementItem] = Field(default_factory=list)


class ProjectAssignRequest(BaseModel):
    project_id: Optional[str] = None


class SpecResponse(BaseModel):
    prd_id: str
    spec_content: str
    spec_version: str
    updated_at: str