"""Profile routes for the Eero Dashboard."""

import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from eero import EeroClient
from eero.exceptions import EeroException

from ..deps import get_network_id, require_auth

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
        profiles = await client.get_profiles(network_id, refresh_cache=refresh)

        result = []
        for profile in profiles:
            # Extract profile ID from URL
            profile_id = None
            if profile.url:
                profile_id = profile.url.split("/")[-1]

            # Extract devices from profile
            device_ids = []
            profile_devices = []
            devices_list = profile.devices if hasattr(profile, "devices") and profile.devices else []
            
            for device in devices_list:
                # Device can be a dict or a Pydantic model
                if isinstance(device, dict):
                    device_url = device.get("url", "")
                    device_id = None
                    if device_url:
                        match = re.search(r"/devices/([^/]+)", device_url)
                        if match:
                            device_id = match.group(1)
                    
                    if device_id:
                        device_ids.append(device_id)
                    
                    profile_devices.append(ProfileDevice(
                        id=device_id,
                        url=device_url,
                        mac=device.get("mac"),
                        nickname=device.get("nickname"),
                        hostname=device.get("hostname"),
                        display_name=device.get("display_name") or device.get("nickname") or device.get("hostname"),
                        manufacturer=device.get("manufacturer"),
                        connected=device.get("connected", False),
                        wireless=device.get("wireless", False),
                        paused=device.get("paused", False),
                    ))
                elif hasattr(device, "url"):
                    device_url = device.url
                    device_id = None
                    if device_url:
                        match = re.search(r"/devices/([^/]+)", device_url)
                        if match:
                            device_id = match.group(1)
                    
                    if device_id:
                        device_ids.append(device_id)
                    
                    profile_devices.append(ProfileDevice(
                        id=device_id,
                        url=device_url,
                        mac=getattr(device, "mac", None),
                        nickname=getattr(device, "nickname", None),
                        hostname=getattr(device, "hostname", None),
                        display_name=getattr(device, "display_name", None) or getattr(device, "nickname", None) or getattr(device, "hostname", None),
                        manufacturer=getattr(device, "manufacturer", None),
                        connected=getattr(device, "connected", False),
                        wireless=getattr(device, "wireless", False),
                        paused=getattr(device, "paused", False),
                    ))

            _LOGGER.debug(f"Profile {profile.name}: {len(profile_devices)} devices")

            result.append(
                ProfileSummary(
                    id=profile_id,
                    url=profile.url,
                    name=profile.name,
                    paused=profile.paused,
                    device_count=len(devices_list),
                    device_ids=device_ids,
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
        profile = await client.get_profile(profile_id, network_id, refresh_cache=refresh)

        extracted_id = None
        if profile.url:
            extracted_id = profile.url.split("/")[-1]

        # Extract devices from profile
        device_ids = []
        profile_devices = []
        devices_list = profile.devices if hasattr(profile, "devices") and profile.devices else []
        
        for device in devices_list:
            # Device can be a dict or a Pydantic model
            if isinstance(device, dict):
                device_url = device.get("url", "")
                device_id = None
                if device_url:
                    match = re.search(r"/devices/([^/]+)", device_url)
                    if match:
                        device_id = match.group(1)
                
                if device_id:
                    device_ids.append(device_id)
                
                profile_devices.append(ProfileDevice(
                    id=device_id,
                    url=device_url,
                    mac=device.get("mac"),
                    nickname=device.get("nickname"),
                    hostname=device.get("hostname"),
                    display_name=device.get("display_name") or device.get("nickname") or device.get("hostname"),
                    manufacturer=device.get("manufacturer"),
                    connected=device.get("connected", False),
                    wireless=device.get("wireless", False),
                    paused=device.get("paused", False),
                ))
            elif hasattr(device, "url"):
                device_url = device.url
                device_id = None
                if device_url:
                    match = re.search(r"/devices/([^/]+)", device_url)
                    if match:
                        device_id = match.group(1)
                
                if device_id:
                    device_ids.append(device_id)
                
                profile_devices.append(ProfileDevice(
                    id=device_id,
                    url=device_url,
                    mac=getattr(device, "mac", None),
                    nickname=getattr(device, "nickname", None),
                    hostname=getattr(device, "hostname", None),
                    display_name=getattr(device, "display_name", None) or getattr(device, "nickname", None) or getattr(device, "hostname", None),
                    manufacturer=getattr(device, "manufacturer", None),
                    connected=getattr(device, "connected", False),
                    wireless=getattr(device, "wireless", False),
                    paused=getattr(device, "paused", False),
                ))

        _LOGGER.debug(f"Profile {profile.name}: {len(profile_devices)} devices")

        return ProfileSummary(
            id=extracted_id,
            url=profile.url,
            name=profile.name,
            paused=profile.paused,
            device_count=len(devices_list),
            device_ids=device_ids,
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
        success = await client.pause_profile(profile_id, paused=True, network_id=network_id)
        return ProfileAction(
            success=success,
            profile_id=profile_id,
            action="pause",
            message="Internet access paused for this profile."
            if success
            else "Failed to pause profile.",
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
        success = await client.pause_profile(profile_id, paused=False, network_id=network_id)
        return ProfileAction(
            success=success,
            profile_id=profile_id,
            action="unpause",
            message="Internet access resumed for this profile."
            if success
            else "Failed to unpause profile.",
        )
    except EeroException as e:
        _LOGGER.error(f"Failed to unpause profile {profile_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to resume profile. Please try again.",
        )
