import os
import sys
import pytest
import torch
import torch.nn as nn
from torchvision import datasets, transforms
from torch.utils.data import DataLoader

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from server.model import CNNModel
from server.aggregator import trimmed_mean
from experiments.evaluation import evaluate_model

import ssl
ssl._create_default_https_context = ssl._create_unverified_context

@pytest.fixture(scope="module")
def mnist_data():
    transform = transforms.Compose([transforms.ToTensor(), transforms.Normalize((0.1307,), (0.3081,))])
    train_dataset = datasets.MNIST('./data', train=True, download=True, transform=transform)
    val_dataset = datasets.MNIST('./data', train=False, download=True, transform=transform)
    
    train_subset = torch.utils.data.Subset(train_dataset, range(1000))
    val_subset = torch.utils.data.Subset(val_dataset, range(500))
    
    train_loader = DataLoader(train_subset, batch_size=32, shuffle=True)
    val_loader = DataLoader(val_subset, batch_size=100, shuffle=False)
    return train_loader, val_loader

def test_trimmed_mean_robustness(mnist_data):
    train_loader, val_loader = mnist_data
    global_model = CNNModel()
    global_weights = global_model.get_weights()
    
    # Train 5 normal clients locally realistically simulating real convergence
    normal_updates = []
    for i in range(5):
        client_model = CNNModel()
        client_model.set_weights(global_weights)
        client_model.train()
        optimizer = torch.optim.SGD(client_model.parameters(), lr=0.01)
        criterion = nn.CrossEntropyLoss()
        
        batch_idx = 0
        for inputs, targets in train_loader:
            if batch_idx % 5 == i:
                optimizer.zero_grad()
                outputs = client_model(inputs)
                loss = criterion(outputs, targets)
                loss.backward()
                optimizer.step()
            batch_idx += 1
        normal_updates.append(client_model.get_weights())
        
    # Synthesize 1 undetected malicious payload
    malicious_weights = {}
    for k, v in global_weights.items():
        malicious_weights[k] = v + torch.randn_like(v) * 50.0
        
    all_updates = normal_updates + [malicious_weights]
    
    # Scenario A: Baseline FedAvg (Highly susceptible to 1 malicious node)
    fedavg_weights = trimmed_mean(all_updates, trim_ratio=0.0)
    fedavg_model = CNNModel()
    fedavg_model.set_weights(fedavg_weights)
    fedavg_metrics = evaluate_model(fedavg_model, val_loader)
    
    # Scenario B: Robust Trimmed Mean (Cuts 20% tails across tensor arrays natively)
    trimmed_weights = trimmed_mean(all_updates, trim_ratio=0.2)
    trimmed_model = CNNModel()
    trimmed_model.set_weights(trimmed_weights)
    trimmed_metrics = evaluate_model(trimmed_model, val_loader)
    
    # Validate mathematical superiority of Robust Aggregation against malicious weight injection
    assert trimmed_metrics["accuracy"] >= fedavg_metrics["accuracy"], "Trimmed Mean accuracy was catastrophically lower than FedAvg!"
    assert trimmed_metrics["loss"] <= fedavg_metrics["loss"], "Trimmed Mean loss was catastrophically higher than FedAvg!"

def test_robust_edge_cases():
    global_model = CNNModel()
    global_weights = global_model.get_weights()
    
    with pytest.raises(ValueError):
        trimmed_mean([])
        
    # Mismatched tensor shapes
    bad_update = {"conv1.weight": torch.randn(1, 1, 1, 1)} 
    updates = [global_weights, bad_update]
    with pytest.raises(RuntimeError):
        # We expect torch.stack to fail due to shape mismatch
        trimmed_mean(updates, trim_ratio=0.0)

    # Missing layer keys
    # trimmed_mean supports graceful isolation of arbitrary structures missing particular elements 
    # ensuring one client missing a key doesn't crash the entire list
    missing_key_update = {k: v for k, v in global_weights.items() if k != "fc2.weight"}
    aggregated = trimmed_mean([global_weights, missing_key_update], trim_ratio=0.0)
    assert "fc2.weight" in aggregated, "Missing key caused total unhandled loss of layer in global aggregation array."

    # Extremely small number of clients with heavy trimming limits to 0 gracefully returning Mean
    small_agg = trimmed_mean([global_weights, global_weights], trim_ratio=0.4)
    assert len(small_agg) == len(global_weights)
