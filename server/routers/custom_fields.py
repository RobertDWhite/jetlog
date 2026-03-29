import json

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from server.db.session import get_db
from server.db.models import CustomFieldDef, CustomFieldValue, Flight
from server.auth.users import get_current_user
from server.models import User

router = APIRouter(
    prefix="/custom-fields",
    tags=["custom-fields"],
    redirect_slashes=True,
)

VALID_FIELD_TYPES = {"text", "number", "rating", "select"}


class FieldDefCreate(BaseModel):
    field_name: str
    field_label: str
    field_type: str
    options: list[str] | None = None
    sort_order: int = 0


class FieldDefResponse(BaseModel):
    id: int
    field_name: str
    field_label: str
    field_type: str
    options: list[str] | None = None
    sort_order: int

    class Config:
        from_attributes = True


class FieldValueSet(BaseModel):
    field_def_id: int
    value: str | None = None


class FieldValueResponse(BaseModel):
    id: int
    flight_id: int
    field_def_id: int
    value: str | None = None

    class Config:
        from_attributes = True


def _field_def_to_response(fd: CustomFieldDef) -> FieldDefResponse:
    options = None
    if fd.options:
        try:
            options = json.loads(fd.options)
        except (json.JSONDecodeError, TypeError):
            options = None

    return FieldDefResponse(
        id=fd.id,
        field_name=fd.field_name,
        field_label=fd.field_label,
        field_type=fd.field_type,
        options=options,
        sort_order=fd.sort_order,
    )


# --- Field Definitions ---

@router.get("/definitions")
async def list_field_definitions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[FieldDefResponse]:
    defs = (
        db.query(CustomFieldDef)
        .filter(CustomFieldDef.username == user.username)
        .order_by(CustomFieldDef.sort_order, CustomFieldDef.id)
        .all()
    )
    return [_field_def_to_response(d) for d in defs]


@router.post("/definitions", status_code=201)
async def create_field_definition(
    body: FieldDefCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FieldDefResponse:
    if not body.field_name or not body.field_name.strip():
        raise HTTPException(status_code=400, detail="field_name is required")
    if not body.field_label or not body.field_label.strip():
        raise HTTPException(status_code=400, detail="field_label is required")
    if body.field_type not in VALID_FIELD_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"field_type must be one of: {', '.join(sorted(VALID_FIELD_TYPES))}"
        )
    if body.field_type == "select" and (not body.options or len(body.options) == 0):
        raise HTTPException(status_code=400, detail="options are required for select field type")

    # Check for duplicate field_name for this user
    existing = (
        db.query(CustomFieldDef)
        .filter(
            CustomFieldDef.username == user.username,
            CustomFieldDef.field_name == body.field_name.strip(),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"Field '{body.field_name}' already exists")

    options_json = json.dumps(body.options) if body.options else None

    field_def = CustomFieldDef(
        username=user.username,
        field_name=body.field_name.strip(),
        field_label=body.field_label.strip(),
        field_type=body.field_type,
        options=options_json,
        sort_order=body.sort_order,
    )
    db.add(field_def)
    db.commit()
    db.refresh(field_def)

    return _field_def_to_response(field_def)


@router.delete("/definitions/{def_id}", status_code=200)
async def delete_field_definition(
    def_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    field_def = db.query(CustomFieldDef).filter(
        CustomFieldDef.id == def_id,
        CustomFieldDef.username == user.username,
    ).first()

    if not field_def:
        raise HTTPException(status_code=404, detail="Custom field definition not found")

    # Delete all values for this field definition (CASCADE should handle this, but be explicit)
    db.query(CustomFieldValue).filter(CustomFieldValue.field_def_id == def_id).delete()
    db.query(CustomFieldDef).filter(CustomFieldDef.id == def_id).delete()
    db.commit()

    return {"status": "deleted", "id": def_id}


# --- Field Values (per flight) ---

@router.get("/flights/{flight_id}")
async def get_flight_custom_fields(
    flight_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[FieldValueResponse]:
    # Verify flight access
    flight = db.query(Flight).filter(Flight.id == flight_id).first()
    if not flight:
        raise HTTPException(status_code=404, detail="Flight not found")
    if flight.username != user.username and not user.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can view other users' custom fields")

    values = (
        db.query(CustomFieldValue)
        .filter(CustomFieldValue.flight_id == flight_id)
        .all()
    )

    return [
        FieldValueResponse(
            id=v.id,
            flight_id=v.flight_id,
            field_def_id=v.field_def_id,
            value=v.value,
        )
        for v in values
    ]


@router.post("/flights/{flight_id}", status_code=200)
async def set_flight_custom_fields(
    flight_id: int,
    body: list[FieldValueSet],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[FieldValueResponse]:
    # Verify flight access
    flight = db.query(Flight).filter(Flight.id == flight_id).first()
    if not flight:
        raise HTTPException(status_code=404, detail="Flight not found")
    if flight.username != user.username and not user.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can modify other users' custom fields")

    # Validate all field_def_ids belong to this user
    user_field_ids = {
        fd.id for fd in
        db.query(CustomFieldDef.id).filter(CustomFieldDef.username == user.username).all()
    }

    for item in body:
        if item.field_def_id not in user_field_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Custom field definition {item.field_def_id} not found or not owned by you"
            )

    results = []
    for item in body:
        existing = db.query(CustomFieldValue).filter(
            CustomFieldValue.flight_id == flight_id,
            CustomFieldValue.field_def_id == item.field_def_id,
        ).first()

        if existing:
            existing.value = item.value
            db.flush()
            results.append(FieldValueResponse(
                id=existing.id,
                flight_id=existing.flight_id,
                field_def_id=existing.field_def_id,
                value=existing.value,
            ))
        else:
            new_val = CustomFieldValue(
                flight_id=flight_id,
                field_def_id=item.field_def_id,
                value=item.value,
            )
            db.add(new_val)
            db.flush()
            results.append(FieldValueResponse(
                id=new_val.id,
                flight_id=new_val.flight_id,
                field_def_id=new_val.field_def_id,
                value=new_val.value,
            ))

    db.commit()
    return results
