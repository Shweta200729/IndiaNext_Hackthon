import os
import sys
import pytest
import torch
import torch.nn as nn
from torchvision import datasets, transforms
from torch.utils.data import DataLoader

# Add backend to path to import successfully
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from server.model import CNNModel
from experiments.evaluation import evaluate_model

# Setup unverified ssl for Mac downloading MNIST safely inside tests
import ssl
ssl._create_default_https_context = ssl._create_unverified_context

@pytest.fixture(scope="module")
def mnist_data():
    transform = transforms.Compose([transforms.ToTensor(), transforms.Normalize((0.1307,), (0.3081,))])
    train_dataset = datasets.MNIST('./data', train=True, download=True, transform=transform)
    val_dataset = datasets.MNIST('./data', train=False, download=True, transform=transform)
    
    # Use subset for faster testing: 1000 train, 500 val
    train_subset = torch.utils.data.Subset(train_dataset, range(1000))
    val_subset = torch.utils.data.Subset(val_dataset, range(500))
    
    train_loader = DataLoader(train_subset, batch_size=32, shuffle=True)
    val_loader = DataLoader(val_subset, batch_size=100, shuffle=False)
    
    return train_loader, val_loader

def test_cnn_training_correctness(mnist_data):
    train_loader, val_loader = mnist_data
    model = CNNModel()
    
    # Evaluate initial
    initial_metrics = evaluate_model(model, val_loader)
    initial_acc = initial_metrics["accuracy"]
    
    # Train for 1 epoch
    model.train()
    optimizer = torch.optim.SGD(model.parameters(), lr=0.01)
    criterion = nn.CrossEntropyLoss()
    
    for inputs, targets in train_loader:
        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, targets)
        loss.backward()
        optimizer.step()
        
    # Evaluate final
    final_metrics = evaluate_model(model, val_loader)
    final_acc = final_metrics["accuracy"]
    
    print(f"\nInitial Accuracy: {initial_acc:.4f}")
    print(f"Final Accuracy: {final_acc:.4f}")
    
    assert final_acc > initial_acc, "Model did not learn; accuracy failed to improve on the validation set."
