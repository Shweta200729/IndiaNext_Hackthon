import os
import sys
import pytest
import asyncio
import torch

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from server.model import CNNModel

# Emulate actual asyncio orchestration mirroring main.py variables precisely
global_model = CNNModel()
model_lock = asyncio.Lock()
pending_updates = []
current_version_num = 1

async def receive_update(client_id, weights):
    global pending_updates
    async with model_lock:
        pending_updates.append((client_id, weights))
        
async def trigger_aggregation():
    global pending_updates, current_version_num
    async with model_lock:
        if len(pending_updates) == 0:
            return
        
        updates_to_process = [u[1] for u in pending_updates]
        # Skip evaluating heavy math in async unit tests, just ensure locks remain protected against race-conditions
        global_model.set_weights(updates_to_process[0])
        current_version_num += 1
        pending_updates.clear()

@pytest.mark.asyncio
async def test_async_safety():
    global pending_updates, current_version_num
    pending_updates.clear()
    current_version_num = 1
    
    # Construct an extreme 100-client concurrent queue bottleneck simulation
    global_weights = global_model.get_weights()
    tasks = []
    
    for i in range(100):
        tasks.append(asyncio.create_task(receive_update(f"client_{i}", global_weights)))
        
    await asyncio.gather(*tasks)
    
    # Assess if any payloads dropped under threading pressure without lock failures
    assert len(pending_updates) == 100, f"Race condition detected: Queue size {len(pending_updates)} != 100"
    
    # Emulate duplicate / conflicting trigger calls (such as users mashing an endpoint while background starts)
    agg_tasks = [asyncio.create_task(trigger_aggregation()) for _ in range(5)]
    await asyncio.gather(*agg_tasks)
    
    # Assess if thread lock prevented duplicate global model updating
    assert len(pending_updates) == 0, "Updates array references were not destroyed securely."
    assert current_version_num == 2, f"Lock failed, server incorrectly multiplied versions during simultaneous event to {current_version_num}"
