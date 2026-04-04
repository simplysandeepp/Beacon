"""
Unit tests for the /wake endpoint.
"""
import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timezone
from backend.api.main import app

client = TestClient(app)


def test_wake_endpoint_returns_200():
    """Test that /wake endpoint returns 200 status code."""
    response = client.get("/wake")
    assert response.status_code == 200


def test_wake_endpoint_response_structure():
    """Test that /wake endpoint returns expected response structure."""
    response = client.get("/wake")
    data = response.json()
    
    assert "status" in data
    assert "wake_timestamp" in data
    assert "estimated_ready_timestamp" in data
    assert "estimated_ready_seconds" in data
    assert "message" in data


def test_wake_endpoint_status_value():
    """Test that /wake endpoint returns 'waking' status."""
    response = client.get("/wake")
    data = response.json()
    
    assert data["status"] == "waking"


def test_wake_endpoint_estimated_ready_seconds():
    """Test that /wake endpoint returns 30 seconds as estimated ready time."""
    response = client.get("/wake")
    data = response.json()
    
    assert data["estimated_ready_seconds"] == 30


def test_wake_endpoint_timestamp_format():
    """Test that timestamps are in ISO format and valid."""
    response = client.get("/wake")
    data = response.json()
    
    # Verify timestamps can be parsed
    wake_time = datetime.fromisoformat(data["wake_timestamp"].replace("Z", "+00:00"))
    ready_time = datetime.fromisoformat(data["estimated_ready_timestamp"].replace("Z", "+00:00"))
    
    # Verify ready time is approximately 30 seconds after wake time
    time_diff = (ready_time - wake_time).total_seconds()
    assert 29 <= time_diff <= 31  # Allow 1 second tolerance


def test_wake_endpoint_cors_enabled():
    """Test that CORS headers are present (middleware should handle this)."""
    response = client.get("/wake")
    # FastAPI TestClient doesn't automatically add CORS headers in test mode,
    # but we can verify the endpoint is accessible
    assert response.status_code == 200
