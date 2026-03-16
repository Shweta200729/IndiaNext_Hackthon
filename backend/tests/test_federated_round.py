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
    
    # Use subset: 1000 train, 500 val
    train_subset = torch.utils.data.Subset(train_dataset, range(1000))
    val_subset = torch.utils.data.Subset(val_dataset, range(500))
    
    train_loader = DataLoader(train_subset, batch_size=32, shuffle=True)
    val_loader = DataLoader(val_subset, batch_size=100, shuffle=False)
    
    return train_loader, val_loader

def test_single_client_federated_round(mnist_data):
    train_loader, val_loader = mnist_data
    
    # Server initializes global model
    global_model = CNNModel()
    initial_metrics = evaluate_model(global_model, val_loader)
    initial_acc = initial_metrics["accuracy"]
    
    # Client copies model
    client_model = CNNModel()
    client_model.set_weights(global_model.get_weights())
    
    # Client trains locally
    client_model.train()
    optimizer = torch.optim.SGD(client_model.parameters(), lr=0.01)
    criterion = nn.CrossEntropyLoss()
    
    for inputs, targets in train_loader:
        optimizer.zero_grad()
        outputs = client_model(inputs)
        loss = criterion(outputs, targets)
        loss.backward()
        optimizer.step()
        
    # Client sends updated weights
    client_weights = client_model.get_weights()
    
    # Server aggregates using Trimmed Mean with 0.0 trimming which equals FedAvg mathematically
    aggregated_weights = trimmed_mean([client_weights], trim_ratio=0.0)
    
    # Server applies aggregated weights
    global_model.set_weights(aggregated_weights)
    
    # Evaluate final
    final_metrics = evaluate_model(global_model, val_loader)
    final_acc = final_metrics["accuracy"]
    
    assert final_acc > initial_acc, "Federated Global Model did not improve after 1 single-client round."

def test_multiple_clients_no_malicious(mnist_data):
    train_loader, val_loader = mnist_data
    global_model = CNNModel()
    
    initial_metrics = evaluate_model(global_model, val_loader)
    
    # Simulate 5 clients
    num_clients = 5
    updates = []
    
    for i in range(num_clients):
        client_model = CNNModel()
        client_model.set_weights(global_model.get_weights())
        client_model.train()
        optimizer = torch.optim.SGD(client_model.parameters(), lr=0.01)
        criterion = nn.CrossEntropyLoss()
        
        # Train on a pseudo non-IID slice by grouping batches
        batch_idx = 0
        for inputs, targets in train_loader:
            if batch_idx % num_clients == i:
                optimizer.zero_grad()
                outputs = client_model(inputs)
                loss = criterion(outputs, targets)
                loss.backward()
                optimizer.step()
            batch_idx += 1
            
        updates.append(client_model.get_weights())
        
    # Aggregate via pure FedAvg
    aggregated_weights = trimmed_mean(updates, trim_ratio=0.0) 
    global_model.set_weights(aggregated_weights)
    
    final_metrics = evaluate_model(global_model, val_loader)
    
    assert final_metrics["accuracy"] > initial_metrics["accuracy"], "Multi-client FedAvg failed to improve accuracy."
    assert final_metrics["loss"] < initial_metrics["loss"], "Multi-client FedAvg failed to decrease loss."
