// aplica o tema salvo antes da primeira pintura (evita piscar)
try { var t = localStorage.getItem('rl-theme'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) {}
