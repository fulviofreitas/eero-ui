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
