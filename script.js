const colors = ['red', 'blue', 'green', 'yellow'];
let deck = [], discardPile = [];
let playerHand = [], aiHand = [], playerBody = [], aiBody = [];
let selectedForDiscard = new Set(); 
let multiDiscardMode = false; 

// --- RECURSOS ---
const translations = { 'organ': 'ÓRGANO', 'virus': 'VIRUS', 'medicine': 'MEDICINA', 'treatment': 'TRATAMIENTO', 'multicolor': 'MULTICOLOR' };
const icons = {
    organ: `<svg viewBox="0 0 512 512"><path fill="currentColor" d="M462.3 62.6C407.5 15.9 326 24.3 275.7 76.2L256 96.5l-19.7-20.3C186.1 24.3 104.5 15.9 49.7 62.6c-62.8 53.6-66.1 149.8-9.9 207.9l193.5 199.8c12.5 12.9 32.8 12.9 45.3 0l193.5-199.8c56.3-58.1 53-154.3-9.8-207.9z"/></svg>`,
    virus: `<svg viewBox="0 0 512 512"><path fill="currentColor" d="M256 0c141.4 0 256 114.6 256 256S397.4 512 256 512 0 397.4 0 256 114.6 0 256 0zM176 256c0-44.2 35.8-80 80-80s80 35.8 80 80-35.8 80-80 80-80-35.8-80-80z"/></svg>`,
    medicine: `<svg viewBox="0 0 512 512"><path fill="currentColor" d="M174.7 96.6L10.2 446.5c-13.6 31.2 9.3 65.5 43.4 65.5h316.8c34.1 0 56.9-34.3 43.4-65.5L251.3 96.6c-17-39.1-73.2-39.1-90.2 0z"/></svg>`,
    shield: `<svg viewBox="0 0 512 512"><path fill="#2980b9" d="M466.5 83.7l-192-80a48.15 48.15 0 0 0-36.9 0l-192 80C27.7 91.1 16 108.6 16 128c0 198.3 114.5 335.7 221.5 380.3 11.8 4.9 25.1 4.9 36.9 0C381.5 463.7 496 326.3 496 128c0-19.4-11.7-36.9-29.5-44.3z"/></svg>`,
    treatment: `<svg viewBox="0 0 512 512"><path fill="white" d="M256 0L32 96l32 320 192 96 192-96 32-320L256 0z"/></svg>`
};

// --- ARRANQUE SEGURO ---
window.onload = function() {
    initGame();
};

function initGame() {
    deck = []; discardPile = []; playerHand = []; aiHand = []; playerBody = []; aiBody = []; 
    selectedForDiscard.clear(); multiDiscardMode = false;
    
    // Generar cartas
    colors.forEach(c => {
        for(let i=0; i<4; i++) deck.push({color: c, type: 'organ'});
        for(let i=0; i<4; i++) deck.push({color: c, type: 'virus'});
        for(let i=0; i<4; i++) deck.push({color: c, type: 'medicine'});
    });
    ['organ', 'virus', 'medicine'].forEach(t => deck.push({color: 'multicolor', type: t}));
    ['Ladrón', 'Trasplante', 'Contagio', 'Guante de Látex', 'Error Médico'].forEach(t => deck.push({type: 'treatment', name: t}));

    deck = deck.sort(() => Math.random() - 0.5);
    
    // Repartir
    for(let i=0; i<3; i++) { 
        if(deck.length) playerHand.push(deck.pop()); 
        if(deck.length) aiHand.push(deck.pop()); 
    }
    
    notify("¡Partida lista! Juega o descarta.");
    render();
}

// --- REINICIO SEGURO ---
function confirmRestart() {
    setTimeout(() => {
        if (confirm("¿Reiniciar partida? Se perderá el progreso.")) {
            initGame();
        }
    }, 50);
}

function notify(msg, isError = false) {
    const bar = document.getElementById('notification-bar');
    if(bar) {
        bar.innerText = msg;
        bar.style.background = isError ? '#e74c3c' : '#f1c40f';
        bar.style.color = isError ? 'white' : '#2c3e50';
    }
}

function drawCard() {
    if (deck.length === 0) {
        if (discardPile.length > 0) {
            deck = discardPile.sort(() => Math.random() - 0.5);
            discardPile = [];
            notify("🔄 Mazo regenerado", false);
        } else return null;
    }
    return deck.pop();
}

// --- CONTROLES MODO MULTIDESCARTE ---
function toggleMultiDiscardMode() {
    multiDiscardMode = !multiDiscardMode;
    selectedForDiscard.clear(); 
    render();
}

function toggleSelection(index) {
    if (selectedForDiscard.has(index)) selectedForDiscard.delete(index);
    else selectedForDiscard.add(index);
    render(); 
}

function confirmMultiDiscard() {
    if (selectedForDiscard.size === 0) { toggleMultiDiscardMode(); return; }
    
    let indices = Array.from(selectedForDiscard).sort((a, b) => b - a);
    indices.forEach(i => {
        discardPile.push(playerHand[i]);
        playerHand.splice(i, 1);
    });
    
    finishPlayerAction();
}

function quickDiscard(index) {
    discardPile.push(playerHand[index]);
    playerHand.splice(index, 1);
    finishPlayerAction();
}

// --- FINALIZAR TURNO ---
function finishPlayerAction() {
    while (playerHand.length < 3) {
        let c = drawCard();
        if(c) playerHand.push(c); else break;
    }
    
    multiDiscardMode = false;
    selectedForDiscard.clear();
    render();

    // VICTORIA INMEDIATA
    if (!checkWin()) {
        setTimeout(aiTurn, 1000);
    }
}

// --- JUGAR CARTA ---
function playCard(index) {
    if (multiDiscardMode) { toggleSelection(index); return; }

    const card = playerHand[index];
    let actionSuccess = false;
    let keepCard = false; 

    if (card.type === 'treatment') {
        actionSuccess = applyTreatment(card.name, true);
    } 
    else if (card.type === 'organ') {
        if (!playerBody.find(o => o.color === card.color)) {
            playerBody.push({color: card.color, vaccines: 0, infected: false});
            actionSuccess = true; keepCard = true; 
        } else notify("⚠️ Ya tienes ese color", true);
    } 
    else if (card.type === 'medicine') {
        let target = playerBody.find(o => (o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && (o.infected || o.vaccines < 2));
        if (target) {
            if (target.infected) target.infected = false; 
            else target.vaccines++;
            actionSuccess = true;
        } else notify("⚠️ No hay objetivo válido", true);
    } 
    else if (card.type === 'virus') {
        let target = aiBody.find(o => (o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && o.vaccines < 2);
        if (target) {
            if (target.vaccines > 0) target.vaccines--; 
            else if (!target.infected) target.infected = true; 
            else {
                aiBody = aiBody.filter(o => o !== target); 
                discardPile.push({color: target.color, type: 'organ'}); 
            }
            actionSuccess = true;
        } else notify("⚠️ No puedes infectar nada", true);
    }

    if (actionSuccess) {
        if (!keepCard) discardPile.push(card);
        playerHand.splice(index, 1);
        
        render(); 
        if (checkWin()) return;
        finishPlayerAction();
    }
}

function applyTreatment(name, isPlayer) {
    let myBody = isPlayer ? playerBody : aiBody;
    let enemyBody = isPlayer ? aiBody : playerBody;
    let success = false;

    switch(name) {
        case 'Ladrón':
            // ARREGLO DUPLICADOS: Roba solo si NO tienes ya ese color (o es multicolor)
            let stealable = enemyBody.find(o => 
                o.vaccines < 2 && 
                !myBody.some(m => m.color === o.color) // .some() comprueba si YA tienes ese color
            );

            if (stealable) {
                if (isPlayer) { playerBody.push(stealable); aiBody = aiBody.filter(o => o !== stealable); }
                else { aiBody.push(stealable); playerBody = playerBody.filter(o => o !== stealable); }
                success = true;
            } else if (isPlayer) notify("⚠️ No hay órganos robables (sin repetir color)", true);
            break;

        case 'Trasplante':
            let myOrg = myBody.find(o => o.vaccines < 2); 
            let enOrg = enemyBody.find(o => o.vaccines < 2);
            if (myOrg && enOrg) {
                if (isPlayer) {
                    playerBody = playerBody.filter(o => o !== myOrg); aiBody = aiBody.filter(o => o !== enOrg);
                    playerBody.push(enOrg); aiBody.push(myOrg);
                } else {
                    aiBody = aiBody.filter(o => o !== myOrg); playerBody = playerBody.filter(o => o !== enOrg);
                    aiBody.push(enOrg); playerBody.push(myOrg);
                }
                success = true;
            } else if (isPlayer) notify("⚠️ No se pueden cambiar órganos inmunizados", true);
            break;
        case 'Contagio':
             let myViruses = myBody.filter(o => o.infected);
             if(myViruses.length > 0) {
                 myViruses.forEach(o => {
                    let t = enemyBody.find(e => !e.infected && e.vaccines === 0 && e.color === o.color);
                    if (t) { o.infected = false; t.infected = true; }
                });
                success = true;
             } break;
        case 'Guante de Látex':
            if (isPlayer) { discardPile.push(...aiHand); aiHand = []; for(let i=0; i<3; i++) { let c = drawCard(); if(c) aiHand.push(c); } }
            else { discardPile.push(...playerHand); playerHand = []; for(let i=0; i<3; i++) { let c = drawCard(); if(c) playerHand.push(c); } }
            success = true; break;
        case 'Error Médico':
            if (isPlayer) [playerBody, aiBody] = [aiBody, playerBody]; 
            else [aiBody, playerBody] = [playerBody, aiBody];
            success = true; break;
    }
    
    // CAMBIO NOMBRE: Usamos "Julio" en vez de IA
    if (success) notify((isPlayer ? "👤 " : "🤖 Julio usó: ") + name);
    return isPlayer ? success : true; 
}

function aiTurn() {
    if (checkWinCondition(playerBody) || checkWinCondition(aiBody)) return;

    let played = false;
    for (let i = 0; i < aiHand.length; i++) {
        let card = aiHand[i];
        if (card.type === 'treatment') { played = applyTreatment(card.name, false); }
        else if (card.type === 'organ' && !aiBody.find(o => o.color === card.color)) {
            aiBody.push({color: card.color, vaccines: 0, infected: false}); played = true;
        } else if (card.type === 'virus') {
            let t = playerBody.find(o => (o.color === card.color || card.color === 'multicolor') && o.vaccines < 2);
            if(t) { 
                if(t.vaccines > 0) t.vaccines--; else if(!t.infected) t.infected = true; 
                else { playerBody = playerBody.filter(o => o !== t); discardPile.push({color: t.color, type: 'organ'}); }
                played = true; discardPile.push(card);
            }
        } else if (card.type === 'medicine') {
            let t = aiBody.find(o => (o.color === card.color || card.color === 'multicolor') && (o.infected || o.vaccines < 2));
            if(t) { 
                if(t.infected) t.infected = false; else t.vaccines++; 
                played = true; discardPile.push(card);
            }
        }
        if (played) { aiHand.splice(i, 1); break; }
    }
    
    if (!played) { 
        discardPile.push(aiHand[0]); aiHand.splice(0, 1); 
        // CAMBIO NOMBRE
        notify("🤖 Julio pasó turno"); 
    }
    
    while(aiHand.length < 3) { let c = drawCard(); if(c) aiHand.push(c); }
    render();
    checkWin();
}

function render() {
    document.getElementById('deck-count').innerText = deck.length;
    
    const pHandDiv = document.getElementById('player-hand');
    if(pHandDiv) {
        pHandDiv.innerHTML = ''; 
        playerHand.forEach((c, i) => {
            const container = document.createElement('div');
            container.className = 'card-container';
            
            const cardDiv = document.createElement('div');
            let isSelected = selectedForDiscard.has(i);
            cardDiv.className = `card ${c.color || 'treatment'} ${isSelected ? 'selected-discard' : ''}`;
            cardDiv.onclick = function() { playCard(i); }; 

            let icon = icons[c.type] || icons.treatment;
            let label = c.name || translations[c.type];
            cardDiv.innerHTML = `${icon}<b>${label}</b>`;
            
            const actionBtn = document.createElement('button');
            if (multiDiscardMode) {
                actionBtn.className = isSelected ? 'discard-btn active' : 'discard-btn';
                actionBtn.innerText = isSelected ? '❌' : '✅';
                actionBtn.onclick = function(e) { e.stopPropagation(); toggleSelection(i); };
            } else {
                actionBtn.className = 'discard-btn';
                actionBtn.innerText = '🗑️';
                actionBtn.onclick = function(e) { e.stopPropagation(); quickDiscard(i); };
            }
            container.appendChild(cardDiv);
            container.appendChild(actionBtn);
            pHandDiv.appendChild(container);
        });
    }

    const controlsArea = document.getElementById('dynamic-controls');
    if(controlsArea) {
        controlsArea.innerHTML = ''; 
        if (!multiDiscardMode) {
            const toggleBtn = document.createElement('button');
            toggleBtn.innerText = '⚙️ Selección';
            toggleBtn.className = 'toggle-mode-btn';
            toggleBtn.onclick = toggleMultiDiscardMode;
            controlsArea.appendChild(toggleBtn);
        } else {
            const confirmBtn = document.createElement('button');
            confirmBtn.innerText = `🗑️ Borrar (${selectedForDiscard.size})`;
            confirmBtn.className = 'main-action-btn';
            confirmBtn.onclick = confirmMultiDiscard;
            
            const cancelBtn = document.createElement('button');
            cancelBtn.innerText = 'Cancelar';
            cancelBtn.className = 'cancel-btn';
            cancelBtn.onclick = toggleMultiDiscardMode;

            controlsArea.appendChild(confirmBtn);
            controlsArea.appendChild(cancelBtn);
        }
    }

    const drawBody = (body, id) => {
        const div = document.getElementById(id);
        if(div) {
            div.innerHTML = '';
            body.forEach(o => {
                const card = document.createElement('div');
                card.className = `card ${o.color} ${o.infected ? 'virus-effect' : ''} ${o.vaccines === 2 ? 'immune' : ''}`;
                card.innerHTML = `${icons.organ}<b>ÓRGANO</b>`;
                if(o.vaccines > 0) {
                    let s = ''; for(let k=0; k<o.vaccines; k++) s += icons.shield;
                    card.innerHTML += `<div class="status-row">${s}</div>`;
                }
                if(o.infected) card.innerHTML += `<div class="status-row" style="color:#c0392b">⚠️</div>`;
                div.appendChild(card);
            });
        }
    };
    drawBody(playerBody, 'player-body');
    drawBody(aiBody, 'ai-body');
}

function checkWinCondition(body) {
    return body.filter(o => !o.infected).length >= 4;
}

function checkWin() {
    if (checkWinCondition(playerBody)) { 
        setTimeout(() => { alert("🎉 ¡VICTORIA!"); initGame(); }, 100); 
        return true; 
    }
    if (checkWinCondition(aiBody)) { 
        // CAMBIO NOMBRE
        setTimeout(() => { alert("💀 JULIO GANA"); initGame(); }, 100); 
        return true; 
    }
    return false;
}
