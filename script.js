// Подключение к децентрализованной сети GunDB
const gun = Gun([
    'https://gun-manhattan.herokuapp.com/gun',
    'https://relay.peer.ooo/gun'
]);

// База данных для сайта
const db = gun.get('xal1tube_v_permanent_v3');

// Данные профиля из локального хранилища браузера
let me = JSON.parse(localStorage.getItem('my_profile')) || { 
    id: 'u_' + Math.random().toString(36).substr(2, 9),
    name: 'User' + Math.floor(Math.random() * 1000), 
    avatar: '',
    subs: []
};

let allVideos = {};
let currentVidId = null;
let currentTab = 'home';

// Инициализация профиля
function initProfile() {
    document.getElementById('uName').value = me.name;
    const def = 'https://api.dicebear.com/7.x/identicon/svg?seed=' + me.name;
    document.getElementById('hAv').src = me.avatar || def;
    document.getElementById('mAv').src = me.avatar || def;
}

// Сохранение профиля
function saveProfile() {
    me.name = document.getElementById('uName').value || me.name;
    localStorage.setItem('my_profile', JSON.stringify(me));
    initProfile();
    alert("Профиль обновлен!");
}

// Изменение аватарки
function changeAvatar(input) {
    const file = input.files[0];
    if (file) {
        const r = new FileReader();
        r.onload = (e) => { 
            me.avatar = e.target.result; 
            saveProfile(); 
        };
        r.readAsDataURL(file);
    }
}

// Загрузка / Публикация видео
function uploadVideo() {
    const t = document.getElementById('vT').value.trim();
    const d = document.getElementById('vD').value.trim();
    const directUrl = document.getElementById('vUrl').value.trim();
    const f = document.getElementById('vF').files[0];

    if (!t) return alert("Введите название видео!");
    if (!directUrl && !f) return alert("Вставьте ссылку на видео или выберите файл!");

    const btn = document.getElementById('upB');
    btn.innerText = "ОТПРАВКА..."; 
    btn.disabled = true;

    if (directUrl) {
        saveVideoToDb(t, d, directUrl, btn);
    } else {
        if (f.size > 15 * 1024 * 1024) {
            btn.innerText = "ОПУБЛИКОВАТЬ"; 
            btn.disabled = false;
            return alert("Файл слишком большой! Максимальный размер файла: 15МБ.");
        }
        const r = new FileReader();
        r.onload = (e) => saveVideoToDb(t, d, e.target.result, btn);
        r.readAsDataURL(f);
    }
}

// Сохранение записи о видео в GunDB
function saveVideoToDb(title, desc, src, btn) {
    const id = 'v_' + Date.now();
    db.get(id).put({
        id: id, 
        title: title, 
        desc: desc || '', 
        src: src, 
        author: me.name, 
        authorId: me.id,
        av: me.avatar, 
        views: 0, 
        likes: 0, 
        dislikes: 0,
        createdAt: new Date().toLocaleDateString()
    }, (ack) => {
        btn.innerText = "ОПУБЛИКОВАТЬ"; 
        btn.disabled = false;
        if (ack.err) {
            alert("Ошибка загрузки. Попробуйте вставить ссылку на MP4 файл.");
        } else {
            toggleSide();
            document.getElementById('vT').value = '';
            document.getElementById('vD').value = '';
            document.getElementById('vUrl').value = '';
            document.getElementById('vF').value = '';
        }
    });
}

// Получение видео из сети GunDB в реальном времени
db.map().on((v, id) => {
    if (!v || !v.src || !v.title) return;
    allVideos[id] = v;
    renderGrid();
});

// Отрисовка карточек видео
function renderGrid() {
    const grid = document.getElementById('vGrid');
    const query = document.getElementById('vSearch').value.toLowerCase();
    grid.innerHTML = '';

    let list = Object.values(allVideos).sort((a,b) => {
        const timeA = parseInt((a.id || '').split('_')[1]) || 0;
        const timeB = parseInt((b.id || '').split('_')[1]) || 0;
        return timeB - timeA;
    });

    if (currentTab === 'subs') {
        list = list.filter(v => me.subs.includes(v.authorId));
    }

    list.forEach(v => {
        if (v.title.toLowerCase().includes(query)) {
            const card = document.createElement('div');
            card.className = 'v-card';
            card.onclick = () => openWatch(v.id);
            const defAv = 'https://api.dicebear.com/7.x/identicon/svg?seed=' + v.author;
            
            card.innerHTML = `
                <video class="thumb" src="${v.src}#t=0.5" preload="metadata"></video>
                <div class="v-card-info">
                    <img class="avatar-small" src="${v.av || defAv}">
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

// Поиск видео
function searchVideos() { renderGrid(); }

// Переключение между вкладками
function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if (event && event.target) {
        event.target.classList.add('active');
    }
    renderGrid();
}

// Страница просмотра видео
function openWatch(id) {
    currentVidId = id;
    const v = allVideos[id];
    
    // Увеличение количества просмотров
    db.get(id).get('views').once(c => db.get(id).get('views').put((c || 0) + 1));

    document.getElementById('pBox').innerHTML = `<video src="${v.src}" controls autoplay></video>`;
    document.getElementById('vTitle').innerText = v.title;
    document.getElementById('vAuthName').innerText = v.author;
    document.getElementById('vDesc').innerText = v.desc || 'Нет описания.';
    document.getElementById('vDate').innerText = v.createdAt || 'Недавно';
    document.getElementById('vAuthAv').src = v.av || ('https://api.dicebear.com/7.x/identicon/svg?seed=' + v.author);

    updateSubBtn(v.authorId);
    
    document.getElementById('watchPage').style.display = 'block';

    // Обновление лайков/просмотров
    db.get(id).on(data => {
        if (currentVidId !== id) return;
        document.getElementById('vLikes').innerText = data.likes || 0;
        document.getElementById('vDis').innerText = data.dislikes || 0;
        document.getElementById('vViews').innerText = (data.views || 0) + ' просмотров';
    });

    loadComms(id);
}

// Система подписок
function toggleSubscribe() {
    const v = allVideos[currentVidId];
    if (!v || !v.authorId) return;

    const idx = me.subs.indexOf(v.authorId);
    if (idx > -1) {
        me.subs.splice(idx, 1);
    } else {
        me.subs.push(v.authorId);
    }
    localStorage.setItem('my_profile', JSON.stringify(me));
    updateSubBtn(v.authorId);
}

function updateSubBtn(authorId) {
    const btn = document.getElementById('subBtn');
    if (me.subs.includes(authorId)) {
        btn.innerText = "Вы подписаны";
        btn.classList.add('subscribed');
    } else {
        btn.innerText = "Подписаться";
        btn.classList.remove('subscribed');
    }
}

// Голосование (Лайки / Дизлайки)
function vote(type) {
    const vRef = db.get(currentVidId);
    vRef.get('voters').get(me.id).once(already => {
        if (already) return alert("Вы уже оставили свой голос!");
        vRef.get('voters').get(me.id).put(true);
        vRef.get(type).once(c => vRef.get(type).put((c || 0) + 1));
    });
}

// Отправка комментариев
function sendComm() {
    const inp = document.getElementById('cInp');
    if (!inp.value.trim()) return;
    const cid = 'c_' + Date.now();
    db.get(currentVidId).get('comms').get(cid).put({
        id: cid, 
        u: me.name, 
        t: inp.value, 
        av: me.avatar
    });
    inp.value = '';
}

// Загрузка комментариев
function loadComms(vidId) {
    const list = document.getElementById('cList');
    list.innerHTML = '';
    db.get(vidId).get('comms').map().on((c) => {
        if (!c || !c.t || currentVidId !== vidId) return;
        const d = document.createElement('div');
        d.style = "background:#1f1f1f; padding:10px; border-radius:8px; margin-top:8px; display:flex; gap:10px; align-items:center;";
        const pic = c.av || ('https://api.dicebear.com/7.x/identicon/svg?seed=' + c.u);
        d.innerHTML = `<img src="${pic}" class="avatar-small"> <div><b>${c.u}</b><br><span style="color:#ddd">${c.t}</span></div>`;
        list.prepend(d);
    });
}

// Управление шторками и меню
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

// Старт инициализации
initProfile();