import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset
from transformers import XLMRobertaForSequenceClassification, XLMRobertaTokenizer
import copy

class EWC:
    def __init__(self, model, dataloader, device, sample_limit=None):
        """
        :param model: The model after training on Task A.
        :param dataloader: Dataloader for Task A (used to compute Fisher info).
        :param device: torch.device.
        :param sample_limit: Limit number of batches to calculate Fisher (for speed).
        """
        self.model = model
        self.device = device
        self.params = {n: p for n, p in self.model.named_parameters() if p.requires_grad}
        
        # 1. Store the 'star' (optimal) parameters from Task A
        self._means = {}
        for n, p in self.params.items():
            self._means[n] = p.clone().detach()

        # 2. Compute Fisher Information Matrix
        self._fisher = self._compute_fisher(dataloader, sample_limit)

    def _compute_fisher(self, dataloader, sample_limit):
        fisher = {}
        for n, p in self.params.items():
            fisher[n] = torch.zeros_like(p.data)

        self.model.eval() # Evaluation mode
        
        print("Computing Fisher Matrix...")
        
        # We need gradients to compute Fisher, so we cannot use torch.no_grad()
        # But we don't want to update optimizer, so we just zero_grad manually
        
        count = 0
        for batch in dataloader:
            self.model.zero_grad()
            
            input_ids = batch['input_ids'].to(self.device)
            attention_mask = batch['attention_mask'].to(self.device)
            labels = batch['labels'].to(self.device)

            # Forward pass
            outputs = self.model(input_ids, attention_mask=attention_mask, labels=labels)
            loss = outputs.loss
            
            # Backward pass to get gradients
            loss.backward()

            # Accumulate squared gradients
            for n, p in self.model.named_parameters():
                if p.requires_grad and p.grad is not None:
                    fisher[n] += p.grad.data ** 2
            
            count += 1
            if sample_limit and count >= sample_limit:
                break

        # Average the accumulated squared gradients
        for n, _ in self.params.items():
            fisher[n] /= count
            fisher[n] = fisher[n].detach() # Detach to save memory
            
        print("Fisher Matrix computed.")
        return fisher

    def penalty(self, model):
        """
        Calculate the EWC loss penalty.
        L_ewc = (lambda / 2) * sum( F_i * (theta_i - theta_i_star)^2 )
        """
        loss = 0
        for n, p in model.named_parameters():
            if n in self._fisher and p.requires_grad:
                _loss = self._fisher[n] * (p - self._means[n]) ** 2
                loss += _loss.sum()
        return loss
    

# --- Main Training Function ---
def train_task(model, dataloader, device, optimizer, ewc=None, ewc_lambda=0.4, epochs=2, task_name="Task"):
    model.train()
    
    for epoch in range(epochs):
        total_loss = 0
        for step, batch in enumerate(dataloader):
            optimizer.zero_grad()
            
            input_ids = batch['input_ids'].to(device)
            attention_mask = batch['attention_mask'].to(device)
            labels = batch['labels'].to(device)
            
            outputs = model(input_ids, attention_mask=attention_mask, labels=labels)
            task_loss = outputs.loss
            
            # Apply EWC Penalty if EWC object exists
            final_loss = task_loss
            if ewc is not None:
                ewc_loss = ewc.penalty(model)
                final_loss = task_loss + (ewc_lambda / 2 * ewc_loss)
            
            final_loss.backward()
            optimizer.step()
            
            total_loss += final_loss.item()
            
        avg_loss = total_loss / len(dataloader)
        print(f"[{task_name}] Epoch {epoch+1}/{epochs} - Loss: {avg_loss:.4f}")