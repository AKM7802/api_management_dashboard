"""CRUD for managed APIs (upstream credentials). Secrets encrypted at rest."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_current_user
from app.db.postgres import get_db
from app.security import encrypt_secret
from app.token_cache import invalidate_credential

router = APIRouter(prefix="/apis", tags=["apis"])


def get_owned_credential(
    api_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.ApiCredential:
    cred = db.get(models.ApiCredential, api_id)
    if cred is None or cred.user_id != user.id:
        # 404 (not 403) so we don't leak other users' resource ids
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API not found")
    return cred


@router.get("", response_model=list[schemas.ApiOut])
def list_apis(
    user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return db.scalars(
        select(models.ApiCredential)
        .where(models.ApiCredential.user_id == user.id)
        .order_by(models.ApiCredential.created_at.desc())
    ).all()


@router.post("", response_model=schemas.ApiOut, status_code=201)
def create_api(
    body: schemas.ApiCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cred = models.ApiCredential(
        user_id=user.id,
        name=body.name,
        provider=body.provider,
        base_url=body.base_url.rstrip("/"),
        encrypted_secret=encrypt_secret(body.secret),
        secret_last4=body.secret[-4:],
    )
    db.add(cred)
    db.commit()
    return cred


@router.get("/{api_id}", response_model=schemas.ApiOut)
def get_api(cred: models.ApiCredential = Depends(get_owned_credential)):
    return cred


@router.patch("/{api_id}", response_model=schemas.ApiOut)
def update_api(
    body: schemas.ApiUpdate,
    request: Request,
    cred: models.ApiCredential = Depends(get_owned_credential),
    db: Session = Depends(get_db),
):
    if body.name is not None:
        cred.name = body.name
    if body.status is not None:
        cred.status = body.status
    if body.secret is not None:  # secret rotation
        cred.encrypted_secret = encrypt_secret(body.secret)
        cred.secret_last4 = body.secret[-4:]
    db.commit()
    # disable/rotation must take effect immediately, not after the cache TTL
    if body.status is not None or body.secret is not None:
        invalidate_credential(request.app, cred.id)
    return cred


@router.delete("/{api_id}", status_code=204)
def delete_api(
    request: Request,
    cred: models.ApiCredential = Depends(get_owned_credential),
    db: Session = Depends(get_db),
):
    credential_id = cred.id
    db.delete(cred)
    db.commit()
    invalidate_credential(request.app, credential_id)
