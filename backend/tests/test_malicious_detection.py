import os
import sys
import pytest
import torch

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from server.model import CNNModel
from server.detection import detect_update

def test_malicious_client_detection():
    # Setup global model
    global_model = CNNModel()
    global_weights = global_model.get_weights()
    
    # Generate 4 normal clients (using slight noise to simulate normal organic gradient drift)
    normal_updates = []
    for _ in range(4):
        client_weights = {}
        for k, v in global_weights.items():
            client_weights[k] = v + torch.randn_like(v) * 0.01
        normal_updates.append(client_weights)
        
    # Generate 1 extreme malicious client injecting raw noise
    malicious_weights = {}
    for k, v in global_weights.items():
        malicious_weights[k] = v + torch.randn_like(v) * 100.0
        
    # Set mock environment bounds directly matching Production constraints if not already set 
    os.environ["DETECTION_NORM_THRESHOLD"] = "50.0"
    os.environ["DETECTION_DISTANCE_THRESHOLD"] = "25.0"
        
    # Ensure normal clients gracefully pass checks
    for idx, update in enumerate(normal_updates):
        status, reason, norm, dist = detect_update(update, global_weights)
        assert status == "ACCEPT", f"Normal client {idx} falsely rejected. Reason: {reason}"
        
    # Ensure adversarial payload triggers rejection
    status, reason, norm, dist = detect_update(malicious_weights, global_weights)
    
    print(f"\nMalicious Norm Bound Reached: {norm:.4f}")
    print(f"Malicious Euclidean Distance Bound Reached: {dist:.4f}")
    print(f"Active Detection Status Output: {status}")
    
    assert status == "REJECT", f"Malicious client bypassed protections! Distance was {dist}, Norm was {norm}."
