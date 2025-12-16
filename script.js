const form = document.getElementById('todo-form');
const titleInput = document.getElementById('title');
const detailsInput = document.getElementById('details');
const priorityInput = document.getElementById('priority');
const dueInput = document.getElementById('due');
const submitBtn = document.getElementById('submit-btn');
const cancelEditBtn = document.getElementById('cancel-edit');
const todoList = document.getElementById('todo-list');
const emptyState = document.getElementById('empty');
const statusFilter = document.getElementById('status-filter');
const priorityFilter = document.getElementById('priority-filter');
const sortSelect = document.getElementById('sort');
const searchInput = document.getElementById('search');
const countOpen = document.getElementById('count-open');
const countDone = document.getElementById('count-done');
const todayLabel = document.getElementById('today');
const themeSelect = document.getElementById('theme-select');
const bulkDeleteBtn = document.getElementById('bulk-delete');
const selectAllCheckbox = document.getElementById('select-all');
const selectedCountLabel = document.getElementById('selected-count');
const enableNotificationsCheckbox = document.getElementById('enable-notifications');
const reminderDaysSelect = document.getElementById('reminder-days');

let todos = [];
let editingId = null;
const storageKey = 'todo-app-v1';
const DB_NAME = 'todo-app-db';
const DB_VERSION = 1;
let db;
let storageFallback = false;
const selectedIds = new Set();
let notificationPermission = false;

const priorityLabels = {
    urgent: 'Urgente',
    high: 'Haute',
    medium: 'Moyenne',
    low: 'Basse',
    none: 'Aucune'
};

function formatDate(dateString) {
    if (!dateString) return 'Aucune échéance';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatRelative(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function isDueSoon(dueDate) {
    if (!dueDate) return false;
    const due = new Date(dueDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    
    const reminderDays = parseInt(reminderDaysSelect.value) || 1;
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    
    return diffDays >= 0 && diffDays <= reminderDays;
}

async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        notificationPermission = false;
        return;
    }
    
    if (Notification.permission === 'granted') {
        notificationPermission = true;
    } else if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        notificationPermission = permission === 'granted';
    }
}

function showNotification(todo) {
    if (!notificationPermission || !enableNotificationsCheckbox.checked) return;
    
    const title = '⏰ Échéance proche';
    const body = `${todo.title} - ${formatDate(todo.due)}`;
    const notification = new Notification(title, {
        body,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="%237cf0c4"/></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="%237cf0c4"/></svg>'
    });
    
    notification.onclick = () => {
        window.focus();
        notification.close();
    };
}

function checkReminders() {
    const now = new Date();
    const lastCheck = localStorage.getItem('lastReminderCheck');
    const today = now.toDateString();
    
    if (lastCheck === today) return;
    
    todos.forEach(todo => {
        if (!todo.done && isDueSoon(todo.due)) {
            showNotification(todo);
        }
    });
    
    localStorage.setItem('lastReminderCheck', today);
}

function initDb() {
    return new Promise(resolve => {
        if (!('indexedDB' in window)) {
            storageFallback = true;
            resolve();
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = event => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains('todos')) {
                database.createObjectStore('todos', { keyPath: 'id' });
            }
        };
        request.onsuccess = event => {
            db = event.target.result;
            resolve();
        };
        request.onerror = () => {
            storageFallback = true;
            resolve();
        };
    });
}

function loadTodos() {
    return new Promise(resolve => {
        if (storageFallback) {
            const raw = localStorage.getItem(storageKey);
            todos = raw ? JSON.parse(raw) : [];
            resolve();
            return;
        }

        const tx = db.transaction('todos', 'readonly');
        const store = tx.objectStore('todos');
        const request = store.getAll();
        request.onsuccess = () => {
            todos = request.result || [];
            resolve();
        };
        request.onerror = () => {
            storageFallback = true;
            const raw = localStorage.getItem(storageKey);
            todos = raw ? JSON.parse(raw) : [];
            resolve();
        };
    });
}

function persistAllLocal() {
    localStorage.setItem(storageKey, JSON.stringify(todos));
}

function persistTodo(todo) {
    return new Promise(resolve => {
        if (storageFallback) {
            persistAllLocal();
            resolve();
            return;
        }
        const tx = db.transaction('todos', 'readwrite');
        tx.objectStore('todos').put(todo);
        tx.oncomplete = resolve;
        tx.onerror = () => {
            storageFallback = true;
            persistAllLocal();
            resolve();
        };
    });
}

function removeTodo(id) {
    return new Promise(resolve => {
        if (storageFallback) {
            persistAllLocal();
            resolve();
            return;
        }
        const tx = db.transaction('todos', 'readwrite');
        tx.objectStore('todos').delete(id);
        tx.oncomplete = resolve;
        tx.onerror = () => {
            storageFallback = true;
            persistAllLocal();
            resolve();
        };
    });
}

function updateCounts() {
    const openCount = todos.filter(t => !t.done).length;
    const doneCount = todos.filter(t => t.done).length;
    countOpen.textContent = `${openCount} en cours`;
    countDone.textContent = `${doneCount} terminées`;
}

function getVisibleTodos() {
    const search = searchInput.value.trim().toLowerCase();
    const status = statusFilter.value;
    const priority = priorityFilter.value;

    const filtered = todos
        .filter(t => (status === 'all') || (status === 'done' ? t.done : !t.done))
        .filter(t => (priority === 'all') || t.priority === priority)
        .filter(t => t.title.toLowerCase().includes(search) || t.details.toLowerCase().includes(search));

    return filtered.sort((a, b) => {
        switch (sortSelect.value) {
            case 'due-asc':
                return (a.due || '') > (b.due || '') ? 1 : -1;
            case 'priority-desc':
                const order = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 };
                return order[b.priority] - order[a.priority];
            default:
                return b.createdAt.localeCompare(a.createdAt);
        }
    });
}

function updateBulkUI(visibleCount, visibleSelected) {
    const totalSelected = selectedIds.size;
    selectedCountLabel.textContent = `${totalSelected} sélectionnée${totalSelected > 1 ? 's' : ''}`;
    bulkDeleteBtn.disabled = totalSelected === 0;

    if (visibleCount === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        return;
    }

    if (visibleSelected === visibleCount) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else if (visibleSelected > 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
}

function renderTodos() {
    todoList.innerHTML = '';
    const visible = getVisibleTodos();

    if (visible.length === 0) {
        emptyState.hidden = false;
        updateCounts();
        updateBulkUI(0, 0);
        return;
    }
    emptyState.hidden = true;

    const template = document.getElementById('todo-template');
    visible.forEach(todo => {
        const node = template.content.firstElementChild.cloneNode(true);
        node.dataset.id = todo.id;
        node.querySelector('.title').textContent = todo.title;
        node.querySelector('.details').textContent = todo.details || 'Pas de détails';
        node.querySelector('.priority').textContent = priorityLabels[todo.priority];
        node.querySelector('.priority').dataset.level = todo.priority;
        node.querySelector('.due').textContent = formatDate(todo.due);
        node.querySelector('.created').textContent = `Créée le ${formatRelative(todo.createdAt)}`;
        
        const reminderBadge = node.querySelector('.reminder');
        if (!todo.done && isDueSoon(todo.due)) {
            reminderBadge.hidden = false;
        }
        
        const checkbox = node.querySelector('.toggle');
        checkbox.checked = todo.done;
        if (todo.done) {
            node.classList.add('done');
        }
        const selectCheckbox = node.querySelector('.select-toggle');
        selectCheckbox.checked = selectedIds.has(todo.id);
        todoList.appendChild(node);
    });

    const visibleSelected = visible.filter(t => selectedIds.has(t.id)).length;
    updateCounts();
    updateBulkUI(visible.length, visibleSelected);
}

function resetForm() {
    form.reset();
    priorityInput.value = 'medium';
    editingId = null;
    submitBtn.textContent = 'Ajouter la tâche';
    cancelEditBtn.hidden = true;
}

async function addOrUpdate(event) {
    event.preventDefault();
    const title = titleInput.value.trim();
    const details = detailsInput.value.trim();
    const priority = priorityInput.value;
    const due = dueInput.value;
    if (!title) return;

    if (editingId) {
        todos = todos.map(t => t.id === editingId ? { ...t, title, details, priority, due } : t);
        const updated = todos.find(t => t.id === editingId);
        await persistTodo(updated);
    } else {
        const newTodo = {
            id: crypto.randomUUID(),
            title,
            details,
            priority,
            due,
            done: false,
            createdAt: new Date().toISOString()
        };
        todos.push(newTodo);
        await persistTodo(newTodo);
    }
    renderTodos();
    resetForm();
}

async function toggleDone(id) {
    todos = todos.map(t => t.id === id ? { ...t, done: !t.done } : t);
    const updated = todos.find(t => t.id === id);
    await persistTodo(updated);
    renderTodos();
}

async function deleteTodo(id) {
    todos = todos.filter(t => t.id !== id);
    await removeTodo(id);
    selectedIds.delete(id);
    renderTodos();
}

function startEdit(id) {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;
    editingId = id;
    titleInput.value = todo.title;
    detailsInput.value = todo.details;
    priorityInput.value = todo.priority;
    dueInput.value = todo.due;
    submitBtn.textContent = 'Enregistrer les modifications';
    cancelEditBtn.hidden = false;
    titleInput.focus();
}

function handleListClick(event) {
    const todoEl = event.target.closest('.todo');
    if (!todoEl) return;
    const id = todoEl.dataset.id;

    if (event.target.classList.contains('toggle')) {
        toggleDone(id);
    }
    if (event.target.classList.contains('delete')) {
        deleteTodo(id);
    }
    if (event.target.classList.contains('edit')) {
        startEdit(id);
    }
    if (event.target.classList.contains('select-toggle')) {
        if (event.target.checked) {
            selectedIds.add(id);
        } else {
            selectedIds.delete(id);
        }
        renderTodos();
    }
}

function handleSelectAllChange() {
    const visible = getVisibleTodos();
    if (selectAllCheckbox.checked) {
        visible.forEach(t => selectedIds.add(t.id));
    } else {
        visible.forEach(t => selectedIds.delete(t.id));
    }
    renderTodos();
}

async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    const idsToDelete = Array.from(selectedIds);
    todos = todos.filter(t => !selectedIds.has(t.id));
    selectedIds.clear();

    for (const id of idsToDelete) {
        await removeTodo(id);
    }

    renderTodos();
}

function hydrateToday() {
    const now = new Date();
    todayLabel.textContent = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

form.addEventListener('submit', addOrUpdate);
todoList.addEventListener('click', handleListClick);
[statusFilter, priorityFilter, sortSelect, searchInput].forEach(el => el.addEventListener('input', renderTodos));
cancelEditBtn.addEventListener('click', resetForm);
selectAllCheckbox.addEventListener('change', handleSelectAllChange);
bulkDeleteBtn.addEventListener('click', handleBulkDelete);
enableNotificationsCheckbox.addEventListener('change', () => {
    if (enableNotificationsCheckbox.checked) {
        requestNotificationPermission();
    }
});
reminderDaysSelect.addEventListener('change', renderTodos);

(async function init() {
    hydrateToday();
    await initDb();
    await loadTodos();
    renderTodos();
    await requestNotificationPermission();
    checkReminders();
    setInterval(checkReminders, 60 * 60 * 1000);
    // thème initial
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    if (themeSelect) themeSelect.value = savedTheme;
})();

// Gestion du changement de thème
if (themeSelect) {
    themeSelect.addEventListener('change', () => {
        const theme = themeSelect.value;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    });
}
