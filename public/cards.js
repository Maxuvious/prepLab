import { token } from './auth.js';
let allCards = [];
async function loadCards(classId = null) {
  try {
    let url = '/api/cards?items=1';
    if (classId) url += `&class_id=${classId}`;
    const res = await fetch(url, {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    });
    if (!res.ok) throw new Error('Failed to load cards');
    allCards = await res.json();
    renderCards('');
  } catch (err) {
    console.error('Error loading cards:', err);
  }
}
function renderCards(searchTerm) {
  const container = document.getElementById('cards');
  container.innerHTML = '';
  const filtered = searchTerm
    ? allCards.filter(c => c.class.toLowerCase().includes(searchTerm) || c.card_text.toLowerCase().includes(searchTerm))
    : allCards;
  for (const card of filtered) {
    const div = document.createElement('div');
    div.className = 'bg-yellow-100 border border-gray-300 rounded-lg shadow-md p-4';
    const title = document.createElement('h3');
    title.className = 'text-xl font-semibold';
    title.style.color = card.class_color;
    title.textContent = card.class;
    const text = document.createElement('p');
    text.textContent = card.card_text;
    const ul = document.createElement('ul');
    ul.className = 'item-list mt-2';
    for (const task of card.tasks || []) {
      const li = document.createElement('li');
      li.className = 'flex items-center';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.task = task.id;
      cb.checked = task.is_checked;
      if (task.color) {
        li.style.backgroundColor = task.color;
        li.title = `Checked by ${task.username}`;
      }
      cb.addEventListener('change', async () => {
        try {
          const res = await fetch('/api/tasks/check', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ taskId: task.id, checked: cb.checked })
          });
          if (!res.ok) throw new Error('Failed to update task');
          loadCards(); // Reload to update
        } catch (err) {
          console.error('Error updating task:', err);
          cb.checked = !cb.checked; // Revert on error
        }
      });
      li.appendChild(cb);
      li.appendChild(document.createTextNode(' ' + task.description));
      ul.appendChild(li);
    }
    if (card.items && card.items.length) {
      const itemsTitle = document.createElement('h4');
      itemsTitle.className = 'text-lg font-medium mt-4';
      itemsTitle.textContent = 'Equipment:';
      div.appendChild(itemsTitle);
      const itemsUl = document.createElement('ul');
      itemsUl.className = 'item-list';
      for (const item of card.items) {
        const li = document.createElement('li');
        li.textContent = `${item.name} (Room ${item.room}, Drawer ${item.drawer_code})`;
        itemsUl.appendChild(li);
      }
      div.appendChild(itemsUl);
    }
    div.appendChild(title);
    div.appendChild(text);
    div.appendChild(ul);
    // Add "Suggest Edit" button for logged-in users
    if (token) {
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Suggest Edit';
      editBtn.className = 'bg-blue-500 text-white p-1 rounded mt-2 hover:bg-blue-600';
      editBtn.onclick = async () => {
        const newClass = prompt('Edit Class:', card.class);
        const newText = prompt('Edit Card Text:', card.card_text);
        if (newClass && newText) {
          try {
            const res = await fetch('/api/change-requests', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
              },
              body: JSON.stringify({ card_id: card.id, class: newClass, card_text: newText })
            });
            if (res.ok) {
              alert('Change request submitted!');
            } else {
              const error = await res.json();
              throw new Error(error.error || 'Failed to submit request.');
            }
          } catch (err) {
            console.error('Error submitting change request:', err);
            alert(err.message);
          }
        } else {
          alert('Edit cancelled or invalid input');
        }
      };
      div.appendChild(editBtn);
    }
    container.appendChild(div);
  }
}
export { loadCards, renderCards };
