document.addEventListener('DOMContentLoaded', () => {
    const auth = firebase.auth();
    const db = firebase.firestore();
    const storage = firebase.storage();

    let taskModal; 
    let currentUser;
    let currentUserData = {}; // To hold user data from Firestore

    // --- New Session-based Splash Logic ---
    if (sessionStorage.getItem('splashShown')) {
        document.body.classList.add('splashed');
    }

    const handleAuthError = (error) => {
        console.error("Authentication Error:", error);
        alert(error.message);
    };

    // --- Splash Screen Logic ---
    const splashScreen = document.getElementById('splash-screen');
    const mainContent = document.getElementById('app') || document.querySelector('.auth-container');

    const hideSplashScreen = () => {
        if (splashScreen && !splashScreen.classList.contains('hidden')) {
            splashScreen.classList.add('hidden');
            sessionStorage.setItem('splashShown', 'true');
        }
        if (mainContent) {
            mainContent.classList.add('visible');
        }
    };

    // --- Auth State Observer ---
    auth.onAuthStateChanged(async user => {
        if (!sessionStorage.getItem('splashShown')) {
            setTimeout(hideSplashScreen, 2000); 
        } else {
            hideSplashScreen();
        }

        const isLoginPage = window.location.pathname.includes('login.html');
        const isRegisterPage = window.location.pathname.includes('register.html');
        const isCategoryPage = window.location.pathname.includes('kategori.html');
        const isProfilePage = window.location.pathname.includes('profil.html');

        if (user) {
            currentUser = user;
            // Fetch user data from Firestore
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                currentUserData = userDoc.data();
            }

            if (isLoginPage || isRegisterPage) {
                window.location.href = 'index.html';
            } else {
                // Update navbar with user info
                const welcomeMsg = document.getElementById('welcome-message');
                // Removed profile picture display logic from navbar
                welcomeMsg.textContent = currentUserData.name || user.email;
                document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());

                // Route to the correct page loader
                if (isCategoryPage) loadCategoryPage();
                else if (isProfilePage) loadProfilePage();
                else loadApp();
            }
        } else {
            currentUser = null;
            currentUserData = {};
            if (!isLoginPage && !isRegisterPage) {
                window.location.href = 'login.html';
            }
        }
    });

    // --- Login/Register Handlers ---
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            auth.signInWithEmailAndPassword(e.target.email.value, e.target.password.value).catch(handleAuthError);
        });
    }
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const { name, email, password } = e.target;
            auth.createUserWithEmailAndPassword(email.value, password.value)
                .then(cred => db.collection('users').doc(cred.user.uid).set({ 
                    name: name.value, 
                    email: email.value,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                }))
                .catch(handleAuthError);
        });
    }

    // --- Profile Page (profil.html) ---
    const loadProfilePage = () => {
        if (!currentUser) return;

        // Display existing data
        document.getElementById('profile-name-display').textContent = currentUserData.name || 'No Name';
        document.getElementById('profile-email-display').textContent = currentUser.email;
        document.getElementById('profile-name').value = currentUserData.name || '';
        // Removed profile picture display logic

        // Handle name update
        document.getElementById('profile-update-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const newName = document.getElementById('profile-name').value;
            try {
                await db.collection('users').doc(currentUser.uid).update({ name: newName });
                alert('Name updated successfully!');
                // Update display instantly
                document.getElementById('profile-name-display').textContent = newName;
                document.getElementById('welcome-message').textContent = newName;
            } catch (error) {
                console.error("Error updating name:", error);
                alert('Failed to update name.');
            }
        });

        // Handle password change
        document.getElementById('password-change-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;
            if (newPassword !== confirmPassword) {
                alert("Passwords do not match.");
                return;
            }
            try {
                await currentUser.updatePassword(newPassword);
                alert('Password updated successfully!');
                e.target.reset();
            } catch (error) {
                console.error("Error updating password:", error);
                alert('Failed to update password. You may need to log in again to perform this action.');
            }
        });

        // Removed profile picture upload logic
    };


    // --- Main App Page (index.html) ---
    const loadApp = async () => {
        if (!document.getElementById('task-list')) return;
        taskModal = new bootstrap.Modal(document.getElementById('task-modal'));
        
        renderSkeletonTasks(); 
        await refreshApp();

        document.getElementById('filter-form').addEventListener('submit', (e) => {
            e.preventDefault();
            applyFiltersAndRender();
        });
        document.getElementById('add-task-btn').addEventListener('click', () => {
            document.getElementById('task-form').reset();
            document.getElementById('task-id').value = '';
            document.getElementById('task-modal-label').textContent = 'Tambah Tugas Baru';
        });
        document.getElementById('task-form').addEventListener('submit', (e) => {
            e.preventDefault();
            saveTask();
        });
        document.getElementById('task-list').addEventListener('click', handleTaskActions);
    };
    
    const refreshApp = async () => {
        if (!currentUser) return;
        const tasks = await fetchTasks(currentUser.uid);
        const categories = await fetchCategories(currentUser.uid);
        renderProgressBar(tasks);
        renderDeadlineNotification(tasks);
        renderCategoryFilter(categories);
        renderCategorySelect(categories);
        renderTasks(tasks, categories);
    };

    // --- Category Page (kategori.html) ---
    const loadCategoryPage = async () => {
        if (!document.getElementById('category-list')) return;
        await renderCategoryList();
        document.getElementById('add-category-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const categoryNameInput = document.getElementById('category-name');
            const categoryName = categoryNameInput.value.trim();
            if (categoryName && currentUser) {
                try {
                    await db.collection('categories').add({
                        nama: categoryName,
                        user_id: currentUser.uid
                    });
                    categoryNameInput.value = '';
                    await renderCategoryList();
                } catch (error) {
                    console.error("Error adding category:", error);
                    alert("Failed to add category. Check Firestore rules and console for errors.");
                }
            }
        });
        document.getElementById('category-list').addEventListener('click', async (e) => {
            const deleteButton = e.target.closest('.delete-category-btn');
            if (deleteButton) {
                const categoryId = deleteButton.dataset.id;
                if (confirm('Yakin ingin menghapus kategori ini?')) {
                    try {
                        await db.collection('categories').doc(categoryId).delete();
                        await renderCategoryList();
                    } catch (error) {
                        console.error("Error deleting category:", error);
                        alert("Failed to delete category. Check Firestore rules and console for errors.");
                    }
                }
            }
        });
    };

    const renderCategoryList = async () => {
        if (!currentUser) return;
        const list = document.getElementById('category-list');
        list.innerHTML = '<li class="list-group-item text-center">Loading...</li>';
        try {
            const categories = await fetchCategories(currentUser.uid);
            list.innerHTML = '';
            if (categories.length === 0) {
                list.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon"><i class="bi bi-tags"></i></div>
                        <p>Anda belum memiliki kategori. <br>Silakan buat kategori pertama Anda!</p>
                    </div>
                `;
                return;
            }
            categories.forEach(cat => {
                const item = document.createElement('li');
                item.className = 'list-group-item d-flex justify-content-between align-items-center';
                item.textContent = cat.nama;
                item.innerHTML += ` <button class="btn btn-sm btn-outline-danger delete-category-btn" data-id="${cat.id}"><i class="bi bi-trash"></i></button>`;
                list.appendChild(item);
            });
        } catch (error) {
            console.error("Error rendering category list:", error);
            list.innerHTML = '<li class="list-group-item text-center text-danger">Gagal memuat kategori.</li>';
        }
    };

    // --- Data Fetching ---
    const fetchTasks = async (userId) => db.collection('tasks').where('userId', '==', userId).get().then(snap => snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    const fetchCategories = async (userId) => db.collection('categories').where('user_id', '==', userId).get().then(snap => snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

    // --- UI Rendering ---
    const renderProgressBar = (tasks) => {
        const total = tasks.length;
        const completed = tasks.filter(t => t.status === 'Selesai').length;
        const percent = total > 0 ? (completed / total) * 100 : 0;
        document.getElementById('progress-text').textContent = `${completed} dari ${total} tugas selesai.`;
        const bar = document.getElementById('progress-bar');
        bar.style.width = `${percent}%`;
        bar.setAttribute('aria-valuenow', percent);
        document.getElementById('progress-percent').textContent = `${Math.round(percent)}%`;
    };

    const renderDeadlineNotification = (tasks) => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const upcoming = tasks.filter(t => t.status === 'Belum Selesai' && t.tgl_deadline && t.tgl_deadline.toDate() >= today && t.tgl_deadline.toDate() <= tomorrow);
        const div = document.getElementById('deadline-notification');
        if (upcoming.length > 0) {
            div.innerHTML = `<i class="bi bi-exclamation-triangle-fill"></i> <b>Perhatian!</b> Tugas berikut akan jatuh tempo: <strong>${upcoming.map(t => t.judul).join(', ')}</strong>.`;
            div.style.display = 'block';
        } else {
            div.style.display = 'none';
        }
    };

    const renderCategoryFilter = (categories) => {
        const select = document.getElementById('kategori-filter');
        select.innerHTML = '<option value="">Semua Kategori</option>';
        categories.forEach(c => select.innerHTML += `<option value="${c.id}">${c.nama}</option>`);
    };
    
    const renderCategorySelect = (categories) => {
        const select = document.getElementById('kategori-select');
        select.innerHTML = '<option value="">Tanpa Kategori</option>';
        categories.forEach(c => select.innerHTML += `<option value="${c.id}">${c.nama}</option>`);
    };

    const renderSkeletonTasks = () => {
        const taskListDiv = document.getElementById('task-list');
        taskListDiv.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const skeletonCard = document.createElement('div');
            skeletonCard.className = 'col-lg-4 col-md-6 mb-4';
            skeletonCard.innerHTML = `
                <div class="skeleton-card">
                    <div class="skeleton-line h-20 w-75 mb-3"></div>
                    <div class="skeleton-line w-50"></div>
                    <div class="skeleton-line mt-3"></div>
                    <div class="skeleton-line w-75"></div>
                </div>
            `;
            taskListDiv.appendChild(skeletonCard);
        }
    };

    const renderTasks = (tasks, categories) => {
        const listDiv = document.getElementById('task-list');
        listDiv.innerHTML = '';
        if (tasks.length === 0) {
            listDiv.innerHTML = `
                <div class="col-12">
                    <div class="empty-state">
                        <div class="empty-state-icon"><i class="bi bi-card-checklist"></i></div>
                        <p>Anda belum memiliki tugas. <br>Klik tombol "Tambah Tugas Baru" untuk memulai!</p>
                    </div>
                </div>
            `;
            return;
        }
        const catMap = Object.fromEntries(categories.map(c => [c.id, c.nama]));
        tasks.forEach(task => {
            const isDone = task.status === 'Selesai';
            let hClass = '';
            if (!isDone && task.tgl_deadline) {
                const deadline = task.tgl_deadline.toDate();
                const today = new Date(); today.setHours(0,0,0,0);
                if (deadline < today) hClass = 'bg-danger text-white';
                else if (deadline.getTime() === today.getTime()) hClass = 'bg-warning text-dark';
            }
            const pMap = { 'Tinggi': {bg:'danger',ic:'bi-exclamation-circle-fill'}, 'Sedang': {bg:'warning',ic:'bi-circle-half'}, 'Rendah': {bg:'success',ic:'bi-check-circle'} };
            const pInfo = pMap[task.prioritas] || {bg:'secondary',ic:'bi-question-circle'};
            const card = document.createElement('div');
            card.className = 'col-lg-4 col-md-6 mb-4';
            card.dataset.taskId = task.id;
            card.innerHTML = `
                <div class="card shadow-sm h-100 ${isDone ? 'task-done' : ''}">
                    <div class="card-header ${hClass}">
                        <h5 class="mb-0">${task.judul}</h5>
                        <small>Deadline: ${task.tgl_deadline ? task.tgl_deadline.toDate().toLocaleDateString('id-ID', {day:'2-digit',month:'short',year:'numeric'}) : 'N/A'}</small>
                    </div>
                    <div class="card-body"><div class="card-text task-description">${task.deskripsi || ''}</div></div>
                    <div class="card-footer bg-transparent">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <span class="badge bg-${pInfo.bg} me-1"><i class="bi ${pInfo.ic}"></i> ${task.prioritas}</span>
                                <span class="badge bg-secondary">${catMap[task.kategori_id] || 'Tanpa Kategori'}</span>
                            </div>
                            <div class="ms-2 d-inline-flex">
                                <button class="btn btn-sm btn-${isDone ? 'secondary' : 'success'} me-1 action-btn" data-action="toggle-status" title="${isDone ? 'Batal Selesai' : 'Tandai Selesai'}"><i class="bi ${isDone ? 'bi-arrow-counterclockwise' : 'bi-check-lg'}"></i></button>
                                <button class="btn btn-sm btn-warning me-1 action-btn" data-action="edit" title="Edit"><i class="bi bi-pencil"></i></button>
                                <button class="btn btn-sm btn-danger action-btn" data-action="delete" title="Hapus"><i class="bi bi-trash"></i></button>
                            </div>
                        </div>
                    </div>
                </div>`;
            listDiv.appendChild(card);
        });
    };

    const applyFiltersAndRender = async () => {
        if (!currentUser) return;
        renderSkeletonTasks(); // Show skeletons while filtering
        const cats = await fetchCategories(currentUser.uid);
        const q = document.getElementById('search-query').value.trim().toLowerCase();
        const catF = document.getElementById('kategori-filter').value;
        const statF = document.getElementById('status-filter').value;
        const sortO = document.getElementById('sort-filter').value;
        let query = db.collection('tasks').where('userId', '==', currentUser.uid);
        if (catF) query = query.where('kategori_id', '==', catF);
        if (statF) query = query.where('status', '==', statF);
        let tasks = await query.get().then(snap => snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        if (q) tasks = tasks.filter(t => t.judul.toLowerCase().includes(q) || (t.deskripsi && t.deskripsi.toLowerCase().includes(q)));
        const pMap = { 'Tinggi': 3, 'Sedang': 2, 'Rendah': 1 };
        tasks.sort((a, b) => {
            switch (sortO) {
                case 'tgl_deadline_asc': return (a.tgl_deadline?.toMillis() || 0) - (b.tgl_deadline?.toMillis() || 0);
                case 'tgl_deadline_desc': return (b.tgl_deadline?.toMillis() || 0) - (a.tgl_deadline?.toMillis() || 0);
                case 'judul_asc': return a.judul.localeCompare(b.judul);
                case 'created_at_desc': return (b.created_at?.toMillis() || 0) - (a.created_at?.toMillis() || 0);
                case 'prioritas_desc': return (pMap[b.prioritas] || 0) - (pMap[a.prioritas] || 0);
                case 'prioritas_asc': return (pMap[a.prioritas] || 0) - (pMap[b.prioritas] || 0);
                default: return (a.tgl_deadline?.toMillis() || 0) - (b.tgl_deadline?.toMillis() || 0);
            }
        });
        renderTasks(tasks, cats);
    };

    const saveTask = async () => {
        if (!currentUser) return;
        const id = document.getElementById('task-id').value;
        const { judul, deskripsi, tgl_deadline, prioritas } = document.getElementById('task-form');
        const kategori_id = document.getElementById('kategori-select').value;
        const lampiranFile = document.getElementById('lampiran').files[0];
        if (!judul.value || !tgl_deadline.value) return alert('Judul dan Deadline harus diisi.');
        const data = {
            userId: currentUser.uid,
            judul: judul.value,
            deskripsi: deskripsi.value,
            tgl_deadline: firebase.firestore.Timestamp.fromDate(new Date(tgl_deadline.value)),
            prioritas: prioritas.value,
            kategori_id: kategori_id || null,
        };
        if (id) {
            const existing = await db.collection('tasks').doc(id).get();
            data.lampiran = existing.data().lampiran || '';
        } else {
            data.status = 'Belum Selesai';
            data.created_at = firebase.firestore.FieldValue.serverTimestamp();
        }
        if (lampiranFile) {
            const fileRef = storage.ref().child(`${currentUser.uid}/${Date.now()}_${lampiranFile.name}`);
            await fileRef.put(lampiranFile);
            data.lampiran = await fileRef.getDownloadURL();
        }
        await (id ? db.collection('tasks').doc(id).update(data) : db.collection('tasks').add(data));
        taskModal.hide();
        await refreshApp();
    };

    const handleTaskActions = async (e) => {
        const btn = e.target.closest('.action-btn');
        if (!btn) return;
        const taskId = btn.closest('[data-task-id]').dataset.taskId;
        const action = btn.dataset.action;
        if (action === 'toggle-status') {
            const doc = await db.collection('tasks').doc(taskId).get();
            await db.collection('tasks').doc(taskId).update({ status: doc.data().status === 'Selesai' ? 'Belum Selesai' : 'Selesai' });
            await refreshApp();
        } else if (action === 'delete') {
            if (confirm('Yakin hapus tugas ini?')) {
                await db.collection('tasks').doc(taskId).delete();
                await refreshApp();
            }
        } else if (action === 'edit') {
            const doc = await db.collection('tasks').doc(taskId).get();
            const data = doc.data();
            const form = document.getElementById('task-form');
            form.reset();
            document.getElementById('task-id').value = doc.id;
            document.getElementById('task-modal-label').textContent = 'Edit Tugas';
            form.judul.value = data.judul;
            form.deskripsi.value = data.deskripsi;
            form.tgl_deadline.valueAsDate = data.tgl_deadline.toDate();
            form.prioritas.value = data.prioritas;
            document.getElementById('kategori-select').value = data.kategori_id;
            taskModal.show();
        }
    };
});