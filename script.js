const gun = Gun([
    'https://gun-manhattan.herokuapp.com/gun',
    'https://relay.peer.ooo/gun'
]);

const db = gun.get('xal1tube_v_final_v4');

let currentUser = JSON.parse(localStorage.getItem('xal1_user')) || null;
let allVideos = {};
let currentVidId = null;
let currentTab = 'home';

// ПРОВЕРКА АВТОРИЗАЦИИ ПРИ СТАРТЕ
window.onload = function() {
    if (currentUser) {
        document.getElementById('authModal').style.display = 'none';
        initUserUI();
    }
};

// АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ
function handleAuth() {
    const name = document.getElementById('authName').value.trim();
    const pass = document.getElementById('authPass').value.trim();
    const msg = document.getElementById('authMsg');

    if (!name || !pass) {
        msg.innerText = "Заполните все поля!";
        return;
    }

    const userNode = db.get('users_db').get(name);

    userNode.once((user) => {
        if (user) {
            // Пользователь существует -> Проверяем пароль
            if (user.pass === pass) {
                loginSuccess(name);
            } else {
                msg.innerText = "Неверный пароль для этого ника!";
            }
        } else {
            // Новый пользователь -> Регистрируем
            userNode.put({ name: name, pass: pass }, (ack) => {
                if (!ack.err) loginSuccess(name);
            });
        }
    });
}

function loginSuccess(name) {
    currentUser = { name: name, subs: [] };
    localStorage.setItem('xal1_user', JSON.stringify(currentUser));
    document.getElementById('authModal').style.display = 'none';
    initUserUI();
}

function logout() {
    localStorage.removeItem('xal1_user');
    location.reload();
}

function initUserUI() {
    const def = 'https://api.dicebear.com/7.x/identicon/svg?seed=' + currentUser.name;
    document.getElementById('hAv').src = def;
}

// ПУБЛИКАЦИЯ ВИДЕО
function uploadVideo() {
    const t = document.getElementById('vT').value.trim();
    const d = document.getElementById('vD').value.trim();
    const url = document.getElementById('vUrl').value.trim();

    if (!t || !url) return alert("Введите название и вставьте прямую ссылку на .mp4 видео!");

    const btn = document.getElementById('upB');
    btn.innerText = "ОТПРАВКА..."; 
    btn.disabled = true;

    const id = 'v_' + Date.now();
    db.get('videos').get(id).put({
        id: id,
        title: t,
        desc: d || '',
        src: url,
        author: currentUser.name,
        views: 0,
        likes: 0,
        dislikes: 0,
        createdAt: new Date().toLocaleDateString()
    }, (ack) => {
        btn.innerText = "ОПУБЛИКОВАТЬ";
        btn.disabled = false;
        if (!ack.err) {
            toggleSide();
            document.getElementById('vT').value = '';
            document.getElementById('vD').value = '';
            document.getElementById('vUrl').value = '';
        } else {
            alert("Ошибка сети при сохранении.");
        }
    });
}

// СИНХРОНИЗАЦИЯ ВИДЕО В РЕАЛЬНОМ ВРЕМЕНИ
db.get('videos').map().on((v, id) => {
    if (!v || !v.src || !v.title) return;
    allVideos[id] = v;
    renderGrid();
});

function renderGrid() {
    const grid = document.getElementById('vGrid');
    const query = document.getElementById('vSearch').value.toLowerCase();
    grid.innerHTML = '';

    let list = Object.values(allVideos).sort((a,b) => {
        const timeA = parseInt((a.id || '').split('_')[1]) || 0;
        const timeB = parseInt((b.id || '').split('_')[1]) || 0;
        return timeB - timeA;
    });

    list.forEach(v => {
        if (v.title.toLowerCase().includes(query)) {
            const card = document.createElement('div');
            card.className = 'v-card';
            card.onclick = () => openWatch(v.id);
            const defAv = 'https://api.dicebear.com/7.x/identicon/svg?seed=' + v.author;
            
            card.innerHTML = `
                <video class="thumb" src="${v.src}#t=0.5" preload="metadata"></video>
                <div class="v-card-info">
                    <img class="avatar-small" src="${defAv}">
                    <div>
                        <div class="v-title">${v.title}</div>
                        <div class="v-meta">${v.author}<br>${v.views || 0} просмотров • ${v.createdAt || 'Недавно'}</div>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        }
    });
}

function openWatch(id) {
    currentVidId = id;
    const v = allVideos[id];
    
    db.get('videos').get(id).get('views').once(c => db.get('videos').get(id).get('views').put((c || 0) + 1));

    document.getElementById('pBox').innerHTML = `<video src="${v.src}" controls autoplay style="width:100%; aspect-ratio:16/9; background:#000; border-radius:12px;"></video>`;
    document.getElementById('vTitle').innerText = v.title;
    document.getElementById('vAuthName').innerText = v.author;
    document.getElementById('vDesc').innerText = v.desc || 'Нет описания.';
    document.getElementById('vDate').innerText = v.createdAt || 'Недавно';
    document.getElementById('vAuthAv').src = 'https://api.dicebear.com/7.x/identicon/svg?seed=' + v.author;

    document.getElementById('watchPage').style.display = 'block';

    db.get('videos').get(id).on(data => {
        if (currentVidId !== id) return;
        document.getElementById('vLikes').innerText = data.likes || 0;
        document.getElementById('vDis').innerText = data.dislikes || 0;
        document.getElementById('vViews').innerText = (data.views || 0) + ' просмотров';
    });

    loadComms(id);
}

function vote(type) {
    const vRef = db.get('videos').get(currentVidId);
    vRef.get('voters').get(currentUser.name).once(already => {
        if (already) return alert("Вы уже проголосовали!");
        vRef.get('voters').get(currentUser.name).put(true);
        vRef.get(type).once(c => vRef.get(type).put((c || 0) + 1));
    });
}

function sendComm() {
    const inp = document.getElementById('cInp');
    if (!inp.value.trim()) return;
    const cid = 'c_' + Date.now();
    db.get('videos').get(currentVidId).get('comms').get(cid).put({
        id: cid, u: currentUser.name, t: inp.value
    });
    inp.value = '';
}

function loadComms(vidId) {
    const list = document.getElementById('cList');
    list.innerHTML = '';
    db.get('videos').get(vidId).get('comms').map().on((c) => {
        if (!c || !c.t || currentVidId !== vidId) return;
        const d = document.createElement('div');
        d.style = "background:#1f1f1f; padding:10px; border-radius:8px; margin-top:8px; display:flex; gap:10px; align-items:center;";
        const pic = 'https://api.dicebear.com/7.x/identicon/svg?seed=' + c.u;
        d.innerHTML = `<img src="${pic}" class="avatar-small"> <div><b>${c.u}</b><br><span style="color:#ddd">${c.t}</span></div>`;
        list.prepend(d);
    });
}

function searchVideos() { renderGrid(); }
function toggleSide() { document.getElementById('sideMenu').classList.toggle('open'); }
function toggleNav() { 
    const nav = document.getElementById('sideNav');
    nav.style.display = (nav.style.display === 'none') ? 'block' : 'none';
}
function closeWatch() { 
    document.getElementById('watchPage').style.display = 'none'; 
    document.getElementById('pBox').innerHTML = '';
    currentVidId = null; 
}
