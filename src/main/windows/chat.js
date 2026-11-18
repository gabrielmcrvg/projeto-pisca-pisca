// ChatGPT: abre o chatgpt.com no navegador padrão do Windows (onde o login com Google funciona).
const { shell } = require('electron');

const CHAT_URL = 'https://chatgpt.com/';

function openChat() { shell.openExternal(CHAT_URL).catch(() => {}); }

Object.assign(module.exports, { CHAT_URL, openChat });
