"""Profile routes for the Eero Dashboard."""

import logging

from eero import EeroClient
from eero.exceptions import EeroException
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from ..deps import get_network_id, require_auth
from ..transformers import check_success, extract_data, extract_list, normalize_profile

router = APIRouter()
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
    try:
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

            _LOGGER.debug(
                f"Profile {profile.get('name')}: {len(profile_devices)} devices"
            )

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
    except EeroException as e:
        _LOGGER.error(f"Failed to get profiles: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve profiles. Please try again.",
        )


@router.get("/{profile_id}", response_model=ProfileSummary)
async def get_profile(
    profile_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
    refresh: bool = Query(False, description="Force cache refresh"),
) -> ProfileSummary:
    """Get detailed information about a specific profile."""
    try:
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
    except EeroException as e:
        _LOGGER.error(f"Failed to get profile {profile_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Profile not found: {profile_id}",
        )


@router.post("/{profile_id}/pause", response_model=ProfileAction)
async def pause_profile(
    profile_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> ProfileAction:
    """Pause internet access for all devices in a profile."""
    try:
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
    except EeroException as e:
        _LOGGER.error(f"Failed to pause profile {profile_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to pause profile. Please try again.",
        )


@router.post("/{profile_id}/unpause", response_model=ProfileAction)
async def unpause_profile(
    profile_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> ProfileAction:
    """Resume internet access for all devices in a profile."""
    try:
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
    except EeroException as e:
        _LOGGER.error(f"Failed to unpause profile {profile_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to resume profile. Please try again.",
        )


@router.post("", response_model=ProfileSummary, status_code=status.HTTP_201_CREATED)
async def create_profile(
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
    try:
        raw_response = await client.create_profile(body.name.strip(), network_id)
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
    except EeroException as e:
        _LOGGER.error(f"Failed to create profile: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create profile. Please try again.",
        )


@router.patch("/{profile_id}", response_model=ProfileSummary)
async def rename_profile(
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
    try:
        raw_response = await client.rename_profile(
            profile_id, body.name.strip(), network_id
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
    except EeroException as e:
        _LOGGER.error(f"Failed to rename profile {profile_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Profile not found: {profile_id}",
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


@router.post("/{profile_id}/assign-devices", response_model=AssignDevicesResponse)
async def assign_devices_to_profile(
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

    try:
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
        raw_profile_resp = await client.get_profile_devices(
            profile_id, network_id
        )
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
        await client.set_profile_devices(
            profile_id, final_urls, network_id
        )

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

    except EeroException as e:
        _LOGGER.error(
            "Failed to assign devices to profile %s: %s", profile_id, e
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to assign devices to profile. Please try again.",
        )


@router.delete("/{profile_id}", response_model=ProfileAction)
async def delete_profile(
    profile_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> ProfileAction:
    """Delete a profile from the network. Devices assigned to this profile will become unassigned."""
    try:
        raw_result = await client.delete_profile(profile_id, network_id)
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
    except EeroException as e:
        _LOGGER.error(f"Failed to delete profile {profile_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete profile. Please try again.",
        )
