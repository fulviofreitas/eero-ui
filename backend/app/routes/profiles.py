"""Profile routes for the Eero Dashboard."""

import logging
import re
from typing import Any

from eero import EeroClient
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from ..deps import (
    get_network_id,
    require_auth,
    require_experimental_writes,
    validate_request_path_ids,
)
from ..transformers import (
    check_success,
    extract_data,
    extract_id_from_url,
    extract_list,
    normalize_profile,
)
from .auth import limiter
from .networks import InsightsResponse, normalize_insights, validate_insight_params

router = APIRouter(dependencies=[Depends(validate_request_path_ids)])
_LOGGER = logging.getLogger(__name__)


class ProfileDevice(BaseModel):
    """Device info from profile."""

    id: str | None = None
    url: str | None = None
    mac: str | None = None
    nickname: str | None = None
    hostname: str | None = None
    display_name: str | None = None
    manufacturer: str | None = None
    connected: bool = False
    wireless: bool = False
    paused: bool = False

    class Config:
        """Pydantic config."""

        extra = "ignore"


class ProfileSummary(BaseModel):
    """Summary of a profile."""

    id: str | None = None
    url: str | None = None
    name: str
    paused: bool = False
    device_count: int = 0
    device_ids: list[str] = []
    devices: list[ProfileDevice] = []

    class Config:
        """Pydantic config."""

        extra = "ignore"


class ProfileAction(BaseModel):
    """Response for profile action endpoints."""

    success: bool
    profile_id: str
    action: str
    message: str | None = None


class ProfileCreateRequest(BaseModel):
    """Request body for creating a profile."""

    name: str

    class Config:
        extra = "ignore"


class ProfileRenameRequest(BaseModel):
    """Request body for renaming a profile."""

    name: str

    class Config:
        extra = "ignore"


@router.get("", response_model=list[ProfileSummary])
async def list_profiles(
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
    refresh: bool = Query(False, description="Force cache refresh"),
) -> list[ProfileSummary]:
    """Get list of all profiles on the network."""
    raw_response = await client.get_profiles(network_id, refresh_cache=refresh)
    raw_profiles = extract_list(raw_response, "profiles")

    result = []
    for raw_profile in raw_profiles:
        profile = normalize_profile(raw_profile)

        # Convert devices to ProfileDevice
        profile_devices = [
            ProfileDevice(
                id=dev.get("id"),
                url=dev.get("url"),
                mac=dev.get("mac"),
                nickname=dev.get("nickname"),
                hostname=dev.get("hostname"),
                display_name=dev.get("display_name"),
                manufacturer=dev.get("manufacturer"),
                connected=dev.get("connected", False),
                wireless=dev.get("wireless", False),
                paused=dev.get("paused", False),
            )
            for dev in profile.get("devices", [])
        ]

        _LOGGER.debug(f"Profile {profile.get('name')}: {len(profile_devices)} devices")

        result.append(
            ProfileSummary(
                id=profile.get("id"),
                url=profile.get("url"),
                name=profile.get("name") or "",
                paused=profile.get("paused", False),
                device_count=profile.get("device_count", 0),
                device_ids=profile.get("device_ids", []),
                devices=profile_devices,
            )
        )

    return result


@router.get("/{profile_id}", response_model=ProfileSummary)
async def get_profile(
    profile_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
    refresh: bool = Query(False, description="Force cache refresh"),
) -> ProfileSummary:
    """Get detailed information about a specific profile."""
    raw_response = await client.get_profile(
        profile_id, network_id, refresh_cache=refresh
    )
    profile = normalize_profile(extract_data(raw_response))

    # Convert devices to ProfileDevice
    profile_devices = [
        ProfileDevice(
            id=dev.get("id"),
            url=dev.get("url"),
            mac=dev.get("mac"),
            nickname=dev.get("nickname"),
            hostname=dev.get("hostname"),
            display_name=dev.get("display_name"),
            manufacturer=dev.get("manufacturer"),
            connected=dev.get("connected", False),
            wireless=dev.get("wireless", False),
            paused=dev.get("paused", False),
        )
        for dev in profile.get("devices", [])
    ]

    _LOGGER.debug(f"Profile {profile.get('name')}: {len(profile_devices)} devices")

    return ProfileSummary(
        id=profile.get("id"),
        url=profile.get("url"),
        name=profile.get("name") or "",
        paused=profile.get("paused", False),
        device_count=profile.get("device_count", 0),
        device_ids=profile.get("device_ids", []),
        devices=profile_devices,
    )


@router.post(
    "/{profile_id}/pause",
    response_model=ProfileAction,
    dependencies=[Depends(require_experimental_writes)],
)
@limiter.shared_limit("10/minute", scope="experimental_writes")
async def pause_profile(
    request: Request,
    profile_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> ProfileAction:
    """Pause internet access for all devices in a profile."""
    raw_result = await client.pause_profile(
        profile_id, paused=True, network_id=network_id
    )
    success = check_success(raw_result)
    return ProfileAction(
        success=success,
        profile_id=profile_id,
        action="pause",
        message=(
            "Internet access paused for this profile."
            if success
            else "Failed to pause profile."
        ),
    )


@router.post(
    "/{profile_id}/unpause",
    response_model=ProfileAction,
    dependencies=[Depends(require_experimental_writes)],
)
@limiter.shared_limit("10/minute", scope="experimental_writes")
async def unpause_profile(
    request: Request,
    profile_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> ProfileAction:
    """Resume internet access for all devices in a profile."""
    raw_result = await client.pause_profile(
        profile_id, paused=False, network_id=network_id
    )
    success = check_success(raw_result)
    return ProfileAction(
        success=success,
        profile_id=profile_id,
        action="unpause",
        message=(
            "Internet access resumed for this profile."
            if success
            else "Failed to unpause profile."
        ),
    )


@router.post(
    "",
    response_model=ProfileSummary,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_experimental_writes)],
)
@limiter.shared_limit("10/minute", scope="experimental_writes")
async def create_profile(
    request: Request,
    body: ProfileCreateRequest,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> ProfileSummary:
    """Create a new profile on the network."""
    if not body.name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profile name cannot be empty",
        )
    # v8 made create_profile's network_id keyword-only (§ 1.6): a
    # positional second argument now raises TypeError, not an EeroException.
    raw_response = await client.create_profile(body.name.strip(), network_id=network_id)
    profile = normalize_profile(extract_data(raw_response))

    profile_devices = [
        ProfileDevice(
            id=dev.get("id"),
            url=dev.get("url"),
            mac=dev.get("mac"),
            nickname=dev.get("nickname"),
            hostname=dev.get("hostname"),
            display_name=dev.get("display_name"),
            manufacturer=dev.get("manufacturer"),
            connected=dev.get("connected", False),
            wireless=dev.get("wireless", False),
            paused=dev.get("paused", False),
        )
        for dev in profile.get("devices", [])
    ]

    return ProfileSummary(
        id=profile.get("id"),
        url=profile.get("url"),
        name=profile.get("name") or "",
        paused=profile.get("paused", False),
        device_count=profile.get("device_count", 0),
        device_ids=profile.get("device_ids", []),
        devices=profile_devices,
    )


@router.patch(
    "/{profile_id}",
    response_model=ProfileSummary,
    dependencies=[Depends(require_experimental_writes)],
)
@limiter.shared_limit("10/minute", scope="experimental_writes")
async def rename_profile(
    request: Request,
    profile_id: str,
    body: ProfileRenameRequest,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> ProfileSummary:
    """Rename an existing profile."""
    if not body.name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profile name cannot be empty",
        )
    raw_response = await client.rename_profile(
        profile_id, body.name.strip(), network_id=network_id
    )
    profile = normalize_profile(extract_data(raw_response))

    profile_devices = [
        ProfileDevice(
            id=dev.get("id"),
            url=dev.get("url"),
            mac=dev.get("mac"),
            nickname=dev.get("nickname"),
            hostname=dev.get("hostname"),
            display_name=dev.get("display_name"),
            manufacturer=dev.get("manufacturer"),
            connected=dev.get("connected", False),
            wireless=dev.get("wireless", False),
            paused=dev.get("paused", False),
        )
        for dev in profile.get("devices", [])
    ]

    return ProfileSummary(
        id=profile.get("id"),
        url=profile.get("url"),
        name=profile.get("name") or "",
        paused=profile.get("paused", False),
        device_count=profile.get("device_count", 0),
        device_ids=profile.get("device_ids", []),
        devices=profile_devices,
    )


class AssignDevicesRequest(BaseModel):
    """Request body for assigning devices to a profile."""

    device_ids: list[str]

    class Config:
        extra = "ignore"


class AssignDevicesResponse(BaseModel):
    """Response for assign-devices endpoint."""

    success: bool
    profile_id: str
    assigned_count: int
    message: str | None = None


@router.post(
    "/{profile_id}/assign-devices",
    response_model=AssignDevicesResponse,
    dependencies=[Depends(require_experimental_writes)],
)
@limiter.shared_limit("10/minute", scope="experimental_writes")
async def assign_devices_to_profile(
    request: Request,
    profile_id: str,
    body: AssignDevicesRequest,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> AssignDevicesResponse:
    """Assign devices to a profile by merging with the existing device list.

    This endpoint performs a single set_profile_devices call with the
    union of currently-assigned devices and the requested device IDs,
    preventing overwrites caused by multiple per-device calls.
    """
    from ..transformers import normalize_device

    # --- Step 1: Build a map of device_id -> device_url from the network ---
    raw_devices_resp = await client.get_devices(network_id)
    raw_devices = extract_list(raw_devices_resp, "devices")
    device_url_map: dict[str, str] = {}
    for raw_dev in raw_devices:
        normalized = normalize_device(raw_dev)
        dev_id = normalized.get("id")
        dev_url = normalized.get("url")
        if dev_id and dev_url:
            device_url_map[dev_id] = dev_url

    # Resolve requested device IDs to URLs; skip unresolvable ones
    selected_urls: set[str] = set()
    for dev_id in body.device_ids:
        url = device_url_map.get(dev_id)
        if url:
            selected_urls.add(url)
        else:
            _LOGGER.warning(
                "Device ID %s not found in network %s — skipping",
                dev_id,
                network_id,
            )

    # --- Step 2: Fetch the profile's current device URLs ---
    raw_profile_resp = await client.get_profile_devices(profile_id, network_id)
    profile_data = extract_data(raw_profile_resp)
    current_devices_raw = profile_data.get("devices", [])
    if isinstance(current_devices_raw, dict):
        current_devices_raw = current_devices_raw.get("data", [])

    current_urls: set[str] = set()
    for entry in current_devices_raw if isinstance(current_devices_raw, list) else []:
        # Entry may be {"url": "..."} or a plain string
        if isinstance(entry, dict):
            url = entry.get("url")
        elif isinstance(entry, str):
            url = entry
        else:
            url = None
        if url:
            current_urls.add(url)

    # --- Step 3: Merge and call set_profile_devices ONCE ---
    final_urls = list(current_urls | selected_urls)
    await client.set_profile_devices(profile_id, final_urls, network_id=network_id)

    assigned_count = len(selected_urls)
    _LOGGER.info(
        "Assigned %d device(s) to profile %s (total after merge: %d)",
        assigned_count,
        profile_id,
        len(final_urls),
    )

    return AssignDevicesResponse(
        success=True,
        profile_id=profile_id,
        assigned_count=assigned_count,
        message=f"Successfully assigned {assigned_count} device(s) to profile.",
    )


@router.delete(
    "/{profile_id}",
    response_model=ProfileAction,
    dependencies=[Depends(require_experimental_writes)],
)
@limiter.shared_limit("10/minute", scope="experimental_writes")
async def delete_profile(
    request: Request,
    profile_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> ProfileAction:
    """Delete a profile from the network. Devices assigned to this profile will become unassigned."""
    raw_result = await client.delete_profile(profile_id, network_id=network_id)
    success = check_success(raw_result)
    return ProfileAction(
        success=success,
        profile_id=profile_id,
        action="delete",
        message=(
            "Profile deleted. Assigned devices are now unassigned."
            if success
            else "Failed to delete profile."
        ),
    )


@router.get("/{profile_id}/insights", response_model=InsightsResponse)
async def get_profile_insights_route(
    profile_id: str,
    start: str = Query(..., description="ISO-8601 window start"),
    end: str = Query(..., description="ISO-8601 window end"),
    insight_type: str = Query(..., description="adblock | blocked | inspected"),
    cadence: str = Query("daily", description="daily | hourly"),
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> InsightsResponse:
    """Query a single profile's insights time series. Premium-gated."""
    validate_insight_params(start, end, insight_type, cadence)
    raw = await client.get_profile_insights(
        profile_id,
        network_id=network_id,
        start=start,
        end=end,
        cadence=cadence,
        insight_type=insight_type,
    )
    return normalize_insights(raw)


# ---------------------------------------------------------------------------
# Profile schedules (phase-6.0-revamp.md WP7, family 1). Unverified,
# non-settings writes (§ 5); none allowlisted (sdk-surface-map-v8.0.3.md
# WP7). ``eero.api.schedule.ScheduleAPI.update_schedule``/``delete_schedule``
# take the pause's own URL or cached envelope, not a bare id, so every
# write route here reads the collection first and resolves the path
# parameter to the matching entry before calling the SDK.
# ---------------------------------------------------------------------------

#: Full lowercase weekday names, matching eero.api.schedule.ALL_DAYS - the
#: SDK forwards ``days`` unchanged, and this is what it (and the API)
#: expects, not "mon".."sun" abbreviations.
SCHEDULE_DAYS = frozenset(
    {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
)

_TIME_RE = re.compile(r"([01]\d|2[0-3]):[0-5]\d")

_SCHEDULE_NAME_MAX_LEN = 64


def _validate_schedule_days(days: list[str]) -> None:
    if not days:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="days must not be empty.",
        )
    if not set(days) <= SCHEDULE_DAYS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"days must be a subset of {sorted(SCHEDULE_DAYS)}.",
        )


def _validate_schedule_time(value: str, field_name: str) -> None:
    if not _TIME_RE.fullmatch(value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} must be HH:MM (24-hour).",
        )


def _validate_schedule_name(name: str) -> None:
    if not name or len(name) > _SCHEDULE_NAME_MAX_LEN:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"name must be 1-{_SCHEDULE_NAME_MAX_LEN} characters.",
        )


class ScheduleSummary(BaseModel):
    """A profile's scheduled pause."""

    id: str | None = None
    name: str | None = None
    days: list[str] = []
    start: str | None = None
    end: str | None = None
    enabled: bool = True

    class Config:
        extra = "ignore"


def _normalize_schedule(raw: dict) -> ScheduleSummary:
    return ScheduleSummary(
        id=extract_id_from_url(raw.get("url")),
        name=raw.get("name"),
        days=raw.get("days") or [],
        start=raw.get("start"),
        end=raw.get("end"),
        enabled=bool(raw.get("enabled", True)),
    )


async def _get_raw_schedules(
    client: EeroClient, profile_id: str, network_id: str
) -> list[dict]:
    raw = await client.get_schedules(profile_id, network_id=network_id)
    return [s for s in extract_list(raw) if isinstance(s, dict)]


async def _find_raw_schedule(
    client: EeroClient, profile_id: str, network_id: str, schedule_id: str
) -> dict:
    """Resolve a schedule_id path parameter to its raw entry (carrying the
    ``url`` the SDK's update/delete calls need), by reading the collection.

    Raises:
        HTTPException: 404 if no schedule with that id exists.
    """
    schedules = await _get_raw_schedules(client, profile_id, network_id)
    for entry in schedules:
        if extract_id_from_url(entry.get("url")) == schedule_id:
            return entry
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found."
    )


@router.get("/{profile_id}/schedules", response_model=list[ScheduleSummary])
async def list_profile_schedules(
    profile_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> list[ScheduleSummary]:
    """Get a profile's scheduled pauses. Verified read."""
    raw_schedules = await _get_raw_schedules(client, profile_id, network_id)
    return [_normalize_schedule(s) for s in raw_schedules]


class ScheduleCreateRequest(BaseModel):
    """Request body for POST /{profile_id}/schedules."""

    name: str
    days: list[str]
    start: str
    end: str
    enabled: bool = True

    class Config:
        extra = "ignore"


@router.post(
    "/{profile_id}/schedules",
    response_model=ScheduleSummary,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_experimental_writes)],
)
@limiter.shared_limit("10/minute", scope="experimental_writes")
async def create_profile_schedule(
    request: Request,
    profile_id: str,
    body: ScheduleCreateRequest,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> ScheduleSummary:
    """Create a scheduled pause for a profile.

    Unverified write (phase-6.0-revamp.md § 5, § 7 WP7). Never retried on
    failure.
    """
    name = body.name.strip()
    _validate_schedule_name(name)
    _validate_schedule_days(body.days)
    _validate_schedule_time(body.start, "start")
    _validate_schedule_time(body.end, "end")

    raw_result = await client.create_schedule(
        profile_id,
        name=name,
        days=body.days,
        start=body.start,
        end=body.end,
        enabled=body.enabled,
        network_id=network_id,
    )
    return _normalize_schedule(extract_data(raw_result))


class ScheduleUpdateRequest(BaseModel):
    """Request body for PUT /{profile_id}/schedules/{schedule_id}.

    Every field is optional - only supplied fields are forwarded, matching
    ``update_schedule``'s own contract.
    """

    name: str | None = None
    days: list[str] | None = None
    start: str | None = None
    end: str | None = None
    enabled: bool | None = None

    class Config:
        extra = "ignore"


@router.put(
    "/{profile_id}/schedules/{schedule_id}",
    response_model=ScheduleSummary,
    dependencies=[Depends(require_experimental_writes)],
)
@limiter.shared_limit("10/minute", scope="experimental_writes")
async def update_profile_schedule(
    request: Request,
    profile_id: str,
    schedule_id: str,
    body: ScheduleUpdateRequest,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> ScheduleSummary:
    """Update a profile's scheduled pause.

    Unverified write (phase-6.0-revamp.md § 5, § 7 WP7); read-first to
    resolve ``schedule_id`` to the pause's own URL, skipping the write
    entirely when nothing in the request differs from the stored value.
    Never retried on failure.
    """
    name = body.name.strip() if body.name is not None else None
    if name is not None:
        _validate_schedule_name(name)
    if body.days is not None:
        _validate_schedule_days(body.days)
    if body.start is not None:
        _validate_schedule_time(body.start, "start")
    if body.end is not None:
        _validate_schedule_time(body.end, "end")

    current = await _find_raw_schedule(client, profile_id, network_id, schedule_id)

    changed = (
        (name is not None and name != current.get("name"))
        or (body.days is not None and body.days != (current.get("days") or []))
        or (body.start is not None and body.start != current.get("start"))
        or (body.end is not None and body.end != current.get("end"))
        or (
            body.enabled is not None
            and body.enabled != bool(current.get("enabled", True))
        )
    )
    if not changed:
        return _normalize_schedule(current)

    raw_result = await client.update_schedule(
        current,
        name=name,
        days=body.days,
        start=body.start,
        end=body.end,
        enabled=body.enabled,
    )
    return _normalize_schedule(extract_data(raw_result))


@router.delete(
    "/{profile_id}/schedules/{schedule_id}",
    dependencies=[Depends(require_experimental_writes)],
)
@limiter.shared_limit("10/minute", scope="experimental_writes")
async def delete_profile_schedule(
    request: Request,
    profile_id: str,
    schedule_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> dict:
    """Delete one of a profile's scheduled pauses.

    Unverified write (phase-6.0-revamp.md § 5, § 7 WP7); read-first to
    resolve ``schedule_id`` to the pause's own URL. Never retried on
    failure.
    """
    current = await _find_raw_schedule(client, profile_id, network_id, schedule_id)
    raw_result = await client.delete_schedule(current)
    return {"success": check_success(raw_result), "schedule_id": schedule_id}


@router.delete(
    "/{profile_id}/schedules",
    dependencies=[Depends(require_experimental_writes)],
)
@limiter.shared_limit("10/minute", scope="experimental_writes")
async def clear_profile_schedules(
    request: Request,
    profile_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> dict:
    """Delete every scheduled pause on a profile.

    Unverified write (phase-6.0-revamp.md § 5, § 7 WP7); one read plus one
    DELETE per existing pause (``clear_profile_schedule``'s own contract -
    it is never retried on a partial failure).
    """
    results = await client.clear_profile_schedule(profile_id, network_id=network_id)
    return {
        "success": all(check_success(r) for r in results) if results else True,
        "deleted_count": len(results),
    }


class BedtimeCreateRequest(BaseModel):
    """Request body for POST /{profile_id}/bedtime."""

    start_time: str
    end_time: str
    days: list[str] | None = None

    class Config:
        extra = "ignore"


@router.post(
    "/{profile_id}/bedtime",
    response_model=ScheduleSummary,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_experimental_writes)],
)
@limiter.shared_limit("10/minute", scope="experimental_writes")
async def create_profile_bedtime(
    request: Request,
    profile_id: str,
    body: BedtimeCreateRequest,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> ScheduleSummary:
    """Create a single bedtime scheduled pause for a profile (built on
    ``create_schedule``, per the SDK's own ``enable_bedtime``).

    Unverified write (phase-6.0-revamp.md § 5, § 7 WP7). Never retried on
    failure.
    """
    _validate_schedule_time(body.start_time, "start_time")
    _validate_schedule_time(body.end_time, "end_time")
    if body.days is not None:
        _validate_schedule_days(body.days)

    raw_result = await client.enable_bedtime(
        profile_id,
        body.start_time,
        body.end_time,
        body.days,
        network_id=network_id,
    )
    return _normalize_schedule(extract_data(raw_result))


# ---------------------------------------------------------------------------
# Profile blocked applications (phase-6.0-revamp.md WP7, family 10).
# Premium (Plus/Secure) - 402 surfaces via the global handler. Write is
# unverified, non-settings (§ 5); none allowlisted.
# ---------------------------------------------------------------------------


class BlockedApplicationsResponse(BaseModel):
    """A profile's blocked-application policy."""

    applications: list[Any] = []

    class Config:
        extra = "ignore"


@router.get(
    "/{profile_id}/blocked-applications", response_model=BlockedApplicationsResponse
)
async def get_profile_blocked_applications(
    profile_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> BlockedApplicationsResponse:
    """Get a profile's blocked-application policy. Premium-gated."""
    raw = await client.get_dns_policy_applications(profile_id, network_id=network_id)
    data = extract_data(raw)
    applications = data.get("applications")
    return BlockedApplicationsResponse(
        applications=applications if isinstance(applications, list) else []
    )


class SetBlockedApplicationsRequest(BaseModel):
    """Request body for PUT /{profile_id}/blocked-applications."""

    applications: list[str]

    class Config:
        extra = "ignore"


@router.put(
    "/{profile_id}/blocked-applications",
    response_model=BlockedApplicationsResponse,
    dependencies=[Depends(require_experimental_writes)],
)
@limiter.shared_limit("10/minute", scope="experimental_writes")
async def set_profile_blocked_applications_route(
    request: Request,
    profile_id: str,
    body: SetBlockedApplicationsRequest,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> BlockedApplicationsResponse:
    """Set a profile's blocked-application policy.

    Unverified write (phase-6.0-revamp.md § 5, § 7 WP7); premium-gated.
    Never retried on failure.
    """
    raw_result = await client.set_profile_blocked_applications(
        profile_id, body.applications, network_id=network_id
    )
    data = extract_data(raw_result)
    applications = data.get("applications")
    return BlockedApplicationsResponse(
        applications=(
            applications if isinstance(applications, list) else body.applications
        )
    )
