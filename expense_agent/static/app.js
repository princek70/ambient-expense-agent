// ========== State ==========
let pendingReviews = JSON.parse(localStorage.getItem('pendingReviews') || '{}');
let expenseHistory = JSON.parse(localStorage.getItem('expenseHistory') || '[]');
let currentSessionId = null;
let currentExpense = null;

// ========== Navigation ==========
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => switchView(item.dataset.view));
});

function switchView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + viewName).classList.add('active');
  document.querySelector(`[data-view="${viewName}"]`).classList.add('active');
  if (viewName === 'review') renderReviewQueue();
  if (viewName === 'history') renderHistory();
  updateStats();
}

// ========== Chat Panel ==========
document.getElementById('chat-toggle-btn').addEventListener('click', () => {
  const panel = document.getElementById('chat-panel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) {
    document.body.classList.add('chat-open');
  } else {
    document.body.classList.remove('chat-open');
  }
});
document.getElementById('chat-close-btn').addEventListener('click', () => {
  document.getElementById('chat-panel').classList.remove('open');
  document.body.classList.remove('chat-open');
});

function setChatInputState(enabled) {
  const input = document.getElementById('chat-input');
  const btn = document.getElementById('chat-send-btn');
  input.disabled = !enabled;
  btn.disabled = !enabled;
  if (enabled) {
    input.placeholder = "Type approve or reject...";
    input.focus();
  } else {
    input.placeholder = "Agent is processing... (Read-only)";
  }
}

document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendChatMessage();
});

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !currentSessionId) return;
  input.value = '';
  addChatBubble(text, 'user');
  sendToAgent(text, currentSessionId);
}

function addChatBubble(text, role) {
  const container = document.getElementById('chat-messages');
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble ' + role;
  bubble.textContent = text;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

// ========== Toast ==========
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ========== Stats — always update all counters ==========
function updateStats() {
  const approved = expenseHistory.filter(e => e.status === 'approved').length;
  const rejected = expenseHistory.filter(e => e.status === 'rejected').length;
  const pending = Object.keys(pendingReviews).length;
  const total = expenseHistory.length + pending;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-approved').textContent = approved;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-rejected').textContent = rejected;

  const badge = document.getElementById('review-badge');
  if (pending > 0) {
    badge.textContent = pending;
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}

// ========== Workflow Visualizer ==========
const WORKFLOW_STEPS = ['parse', 'pii', 'security', 'risk', 'approval'];

// Map node names (from nodeInfo.path) to workflow steps
const NODE_TO_STEP = {
  'parse_expense': 'parse',
  'route_expense': 'parse',
  'scrub_pii': 'pii',
  'detect_injection': 'security',
  'route_security': 'security',
  'risk_evaluator': 'risk',
  'human_approval': 'approval',
  'auto_approve': 'approval',
  'record_outcome': 'approval',
};

function getNodeName(event) {
  // Extract the last node name from nodeInfo.path
  // e.g. "expense_approval_workflow@1/auto_approve@1" → "auto_approve"
  if (event.nodeInfo && event.nodeInfo.path) {
    const segments = event.nodeInfo.path.split('/');
    const lastSeg = segments[segments.length - 1]; // "auto_approve@1"
    return lastSeg.split('@')[0]; // "auto_approve"
  }
  return '';
}

function resetWorkflow() {
  WORKFLOW_STEPS.forEach(s => {
    const el = document.getElementById('step-' + s);
    if (el) {
      el.classList.remove('active', 'completed');
    }
  });
}

function setWorkflowStep(stepName) {
  if (!stepName) return;
  const idx = WORKFLOW_STEPS.indexOf(stepName);
  if (idx === -1) return;
  WORKFLOW_STEPS.forEach((s, i) => {
    const el = document.getElementById('step-' + s);
    if (!el) return;
    el.classList.remove('active', 'completed');
    if (i < idx) el.classList.add('completed');
    if (i === idx) el.classList.add('active');
  });
}

function completeAllSteps() {
  WORKFLOW_STEPS.forEach(s => {
    const el = document.getElementById('step-' + s);
    if (!el) return;
    el.classList.remove('active');
    el.classList.add('completed');
  });
}

// ========== Expense Form Submission ==========
document.getElementById('expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const expense = {
    amount: parseFloat(document.getElementById('amount').value),
    submitter: document.getElementById('submitter').value,
    category: document.getElementById('category').value,
    description: document.getElementById('description').value,
    date: document.getElementById('date').value,
  };

  currentExpense = { ...expense };

  // Disable submit button
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Processing...';

  // Show workflow
  const wfContainer = document.getElementById('workflow-container');
  wfContainer.style.display = 'block';
  resetWorkflow();

  // Open chat panel
  const chatPanel = document.getElementById('chat-panel');
  if (!chatPanel.classList.contains('open')) {
    chatPanel.classList.add('open');
    document.body.classList.add('chat-open');
  }
  
  // Ensure chat input is disabled initially
  setChatInputState(false);
  addChatBubble(`Submitting: $${expense.amount} — ${expense.category} — ${expense.description}`, 'user');

  try {
    // Create a session
    const sessRes = await fetch('/apps/expense_agent/users/web-user/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const sessData = await sessRes.json();
    currentSessionId = sessData.id;

    // Send expense via SSE
    await sendToAgent(JSON.stringify(expense), currentSessionId);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    resetForm();
  }
});

// ========== Send to Agent via SSE ==========
async function sendToAgent(messageText, sessionId) {
  const body = {
    app_name: 'expense_agent',
    user_id: 'web-user',
    session_id: sessionId,
    new_message: {
      role: 'user',
      parts: [{ text: messageText }],
    },
    streaming: true,
  };

  let response;
  try {
    response = await fetch('/run_sse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
    resetForm();
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let needsHumanApproval = false;
  let flowCompleted = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep the incomplete last line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;

      let event;
      try {
        event = JSON.parse(jsonStr);
      } catch (e) {
        continue; // skip unparseable
      }

      // Skip partial streaming chunks (only show final aggregated events)
      if (event.partial === true) continue;

      const nodeName = getNodeName(event);
      const stepName = NODE_TO_STEP[nodeName] || null;

      // 1. Update workflow visualizer
      if (stepName) {
        setWorkflowStep(stepName);
      }

      // 2. Show text in chat panel
      const text = extractDisplayText(event);
      if (text) {
        const label = nodeName && nodeName !== 'expense_approval_workflow' ? `[${prettifyNode(nodeName)}] ` : '';
        addChatBubble(label + text, 'agent');
      }

      // 3. Detect HUMAN APPROVAL request (adk_request_input functionCall)
      if (hasFunctionCall(event, 'adk_request_input')) {
        needsHumanApproval = true;
      }

      // 4. Detect COMPLETED flow via output.status
      if (!flowCompleted && event.output && typeof event.output === 'object' && event.output.status) {
        const status = event.output.status.toLowerCase();
        if (status === 'approved' || status === 'rejected') {
          flowCompleted = true;
          completeAllSteps();
          const reviewer = (nodeName === 'auto_approve') ? 'system' : 'human';
          addToHistory(currentExpense, status, reviewer);
          showToast(
            status === 'approved' ? '✅ Expense approved!' : '❌ Expense rejected!',
            status === 'approved' ? 'success' : 'error'
          );
          resetForm();
        }
      }
    }
  }

  // After the entire stream ends — handle human approval if flow didn't complete
  if (needsHumanApproval && !flowCompleted && currentExpense) {
    pendingReviews[sessionId] = {
      ...currentExpense,
      sessionId: sessionId,
    };
    savePending();
    updateStats();
    showToast('⏳ Expense requires human approval!', 'info');
    switchView('review');
    
    // Enable chat input so the user can communicate their decision
    setChatInputState(true);
    
    // Re-enable submit form button
    const btn = document.getElementById('submit-btn');
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="send" style="width:18px;height:18px"></i> Submit for Processing';
    lucide.createIcons();
  }
}

// ========== Helpers for SSE parsing ==========

function extractDisplayText(event) {
  // Get human-readable text from the event, skipping thoughtSignatures and functionCalls
  if (!event.content || !event.content.parts) return '';
  const texts = [];
  for (const part of event.content.parts) {
    if (part.functionCall) continue;    // skip function calls
    if (part.thoughtSignature) continue; // skip thought signatures
    if (part.text && part.text.trim()) {
      texts.push(part.text.trim());
    }
  }
  return texts.join('\n');
}

function hasFunctionCall(event, fnName) {
  if (!event.content || !event.content.parts) return false;
  return event.content.parts.some(p => p.functionCall && p.functionCall.name === fnName);
}

function prettifyNode(name) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ========== Review Queue ==========
function renderReviewQueue() {
  const grid = document.getElementById('review-grid');
  const keys = Object.keys(pendingReviews);

  if (keys.length === 0) {
    grid.innerHTML = '';
    grid.appendChild(createEmptyState('inbox', 'No expenses pending review'));
    lucide.createIcons();
    return;
  }

  grid.innerHTML = '';
  keys.forEach(sid => {
    const exp = pendingReviews[sid];
    const card = document.createElement('div');
    card.className = 'glass-card review-card';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <span class="badge pending">Pending Review</span>
        <span style="color:var(--text-secondary);font-size:0.85rem">${exp.date}</span>
      </div>
      <h3 style="margin-bottom:8px">$${exp.amount.toFixed(2)}</h3>
      <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:4px"><strong>From:</strong> ${exp.submitter}</p>
      <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:4px"><strong>Category:</strong> ${exp.category}</p>
      <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:16px"><strong>Description:</strong> ${exp.description}</p>
      <div class="review-actions">
        <button class="btn btn-success" onclick="handleReviewAction('${sid}', 'approve')">
          <i data-lucide="check" style="width:16px;height:16px"></i> Approve
        </button>
        <button class="btn btn-danger" onclick="handleReviewAction('${sid}', 'reject')">
          <i data-lucide="x" style="width:16px;height:16px"></i> Reject
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
  lucide.createIcons();
}

async function handleReviewAction(sessionId, action) {
  const exp = pendingReviews[sessionId];
  if (!exp) return;

  currentSessionId = sessionId;
  currentExpense = { ...exp };

  // Open chat and show the action
  const chatPanel = document.getElementById('chat-panel');
  if (!chatPanel.classList.contains('open')) {
    chatPanel.classList.add('open');
    document.body.classList.add('chat-open');
  }
  
  // Disable input while processing the decision
  setChatInputState(false);
  
  addChatBubble(`Decision: ${action}`, 'user');

  // Remove from pending
  delete pendingReviews[sessionId];
  savePending();
  renderReviewQueue();
  updateStats();

  showToast(`Sending ${action} decision...`, 'info');

  // Show workflow with approval step active
  const wfContainer = document.getElementById('workflow-container');
  wfContainer.style.display = 'block';
  // Mark all prior steps as completed, approval as active
  WORKFLOW_STEPS.forEach((s, i) => {
    const el = document.getElementById('step-' + s);
    if (!el) return;
    el.classList.remove('active', 'completed');
    if (i < WORKFLOW_STEPS.length - 1) el.classList.add('completed');
    else el.classList.add('active');
  });

  // Send the decision to the agent
  await sendToAgent(action, sessionId);
}

// ========== History ==========
function renderHistory() {
  const tbody = document.getElementById('history-tbody');
  if (expenseHistory.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">
      <i data-lucide="archive" style="width:48px;height:48px;display:block;margin:0 auto 16px"></i>
      <p>No expense history yet</p>
    </td></tr>`;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = '';
  expenseHistory.slice().reverse().forEach(exp => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${exp.date}</td>
      <td>${exp.submitter}</td>
      <td>$${exp.amount.toFixed(2)}</td>
      <td style="text-transform:capitalize">${exp.category}</td>
      <td><span class="badge ${exp.status}">${exp.status}</span></td>
      <td style="text-transform:capitalize">${exp.reviewer}</td>
    `;
    tbody.appendChild(row);
  });
}

function addToHistory(expense, status, reviewer) {
  if (!expense) return;
  expenseHistory.push({
    amount: expense.amount,
    submitter: expense.submitter,
    category: expense.category,
    description: expense.description,
    date: expense.date,
    status: status,
    reviewer: reviewer,
  });
  localStorage.setItem('expenseHistory', JSON.stringify(expenseHistory));
  updateStats();
}

// ========== Helpers ==========
function savePending() {
  localStorage.setItem('pendingReviews', JSON.stringify(pendingReviews));
}

function resetForm() {
  document.getElementById('expense-form').reset();
  const btn = document.getElementById('submit-btn');
  btn.disabled = false;
  btn.innerHTML = '<i data-lucide="send" style="width:18px;height:18px"></i> Submit for Processing';
  lucide.createIcons();
  document.getElementById('date').valueAsDate = new Date();
  setChatInputState(false);
}

function createEmptyState(icon, text) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `<i data-lucide="${icon}" style="width:48px;height:48px;display:block;margin:0 auto 16px"></i><p>${text}</p>`;
  return div;
}

// ========== Init ==========
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  updateStats();
  document.getElementById('date').valueAsDate = new Date();
});
