import os
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from supabase import Client, create_client

load_dotenv()

app = FastAPI(title="Solara API", version="0.1.0")


def build_tenant_name(email: str | None, metadata: dict[str, Any]) -> str:
    meta_name = metadata.get("tenant_name") or metadata.get("full_name")
    if isinstance(meta_name, str) and meta_name.strip():
        return meta_name.strip()
    if not email:
        return "Nova clinica"
    return email.split("@")[0] or "Nova clinica"


def get_supabase() -> Client:
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not supabase_key:
        raise HTTPException(status_code=500, detail="Supabase service role not configured")
    return create_client(supabase_url, supabase_key)


def first_row(rows: Any) -> dict[str, Any] | None:
    if isinstance(rows, list) and rows:
        row = rows[0]
        if isinstance(row, dict):
            return row
    return None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/tenants/ensure")
def tenants_ensure(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing access token")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing access token")

    supabase = get_supabase()
    user_response = supabase.auth.get_user(token)
    user = user_response.user
    if not user:
        raise HTTPException(status_code=401, detail="Invalid user token")

    user_id = user.id
    user_email = user.email
    metadata = user.user_metadata or {}
    if not isinstance(metadata, dict):
        metadata = {}

    existing = (
        supabase.table("tenant_users")
        .select("tenant_id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    existing_row = first_row(existing.data)
    tenant_id = existing_row.get("tenant_id") if existing_row else None
    created = False

    if not tenant_id:
        metadata_tenant_id = metadata.get("tenant_id")
        if isinstance(metadata_tenant_id, str) and metadata_tenant_id:
            tenant_check = (
                supabase.table("tenants")
                .select("id")
                .eq("id", metadata_tenant_id)
                .limit(1)
                .execute()
            )
            tenant_row = first_row(tenant_check.data)
            if tenant_row:
                tenant_id = tenant_row["id"]

        if not tenant_id:
            tenant_name = build_tenant_name(user_email, metadata)
            inserted = (
                supabase.table("tenants")
                .insert({"nome": tenant_name, "ativo": True})
                .execute()
            )
            inserted_row = first_row(inserted.data)
            if not inserted_row or not inserted_row.get("id"):
                raise HTTPException(status_code=500, detail="Failed to create tenant")
            tenant_id = inserted_row["id"]
            created = True

        existing_link = (
            supabase.table("tenant_users")
            .select("tenant_id")
            .eq("tenant_id", tenant_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not first_row(existing_link.data):
            supabase.table("tenant_users").insert(
                {"tenant_id": tenant_id, "user_id": user_id, "role": "admin"}
            ).execute()

        supabase.table("solara_status").upsert(
            {"tenant_id": tenant_id, "status": "ai"}, on_conflict="tenant_id"
        ).execute()

        supabase.table("solara_automation_settings").upsert(
            {
                "tenant_id": tenant_id,
                "auto_reply_enabled": True,
                "nps_enabled": True,
                "nps_message": "Oi {cliente}! Em uma escala de 0 a 10, o quanto voce recomendaria a {clinica}?",
                "birthday_enabled": True,
                "birthday_message": "Feliz aniversario, {cliente}! A {clinica} deseja um dia especial.",
                "christmas_enabled": True,
                "christmas_message": "A {clinica} deseja um Feliz Natal e um otimo fim de ano!",
                "newyear_enabled": True,
                "newyear_message": "A {clinica} deseja um Feliz Ano Novo! Conte com a gente em {ano}.",
                "followup_7d_enabled": True,
                "followup_7d_message": "Oi {cliente}! Como voce esta apos a consulta? Posso ajudar em algo?",
                "followup_11m_enabled": True,
                "followup_11m_message": "Oi {cliente}, ja faz quase um ano da sua ultima consulta. Deseja agendar um retorno?",
            },
            on_conflict="tenant_id",
        ).execute()

    if not tenant_id:
        raise HTTPException(status_code=500, detail="Failed to ensure tenant")

    instance_id = os.getenv("EVOLUTION_INSTANCE")
    api_url = os.getenv("EVOLUTION_API_URL")
    if instance_id and api_url:
        existing_conn = (
            supabase.table("evolution_conexoes")
            .select("id")
            .eq("tenant_id", tenant_id)
            .limit(1)
            .execute()
        )
        if not first_row(existing_conn.data):
            default_phone = (
                user.phone
                or metadata.get("phone")
                or os.getenv("DEFAULT_WHATSAPP_NUMBER")
                or "5512991187251"
            )
            tenant_name = build_tenant_name(user_email, metadata)
            supabase.table("evolution_conexoes").insert(
                {
                    "tenant_id": tenant_id,
                    "nome": tenant_name,
                    "telefone": default_phone,
                    "instance_id": instance_id,
                    "api_url": api_url,
                    "ativo": True,
                }
            ).execute()

    return {"ok": True, "created": created, "tenant_id": tenant_id}


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "solara-api", "status": "running"}
