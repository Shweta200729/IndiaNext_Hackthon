import pytest


# Set asyncio mode globally for the test suite
# This ensures @pytest.mark.asyncio tests run correctly with pytest-asyncio
def pytest_configure(config):
    config.addinivalue_line("markers", "asyncio: mark test as async")
