import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict

class CNNModel(nn.Module):
    """
    Real PyTorch CNN Model optimized for the MNIST dataset (1x28x28 grayscale images).
    Architecture:
    - Conv2D (1 -> 16, kernel_size=3)
    - MaxPool2D (2x2)
    - Conv2D (16 -> 32, kernel_size=3)
    - MaxPool2D (2x2)
    - Linear (32 * 5 * 5 -> 128)
    - Linear (128 -> 10 classes)
    """
    def __init__(self):
        super(CNNModel, self).__init__()
        self.conv1 = nn.Conv2d(1, 16, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(16, 32, kernel_size=3, padding=1)
        self.pool = nn.MaxPool2d(2, 2)
        self.fc1 = nn.Linear(32 * 7 * 7, 128)
        self.fc2 = nn.Linear(128, 10)

    def forward(self, x):
        x = self.pool(F.relu(self.conv1(x)))
        x = self.pool(F.relu(self.conv2(x)))
        x = x.view(-1, 32 * 7 * 7) # Flatten
        x = F.relu(self.fc1(x))
        x = self.fc2(x)
        return x

    def get_weights(self) -> Dict[str, torch.Tensor]:
        """Returns the current state_dict isolated onto the CPU."""
        return {k: v.cpu().clone() for k, v in self.state_dict().items()}

    def set_weights(self, weights: Dict[str, torch.Tensor]):
        """Safely loads a new state_dict into the model parameters."""
        self.load_state_dict(weights)
