import { runAgent } from "./ai-agent.js";

const MAX_HISTORY_MESSAGES = 8; // remembers the last 4 exchanges
const GREETING =
  'Hi! Tell me what you spent, like "spent 150 on lunch", or ask "how much did I spend on food this week?"';

export function initChat(getUser) {
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");
  const log = document.getElementById("chat-log");

  let history = [];
  let busy = false;

  function addBubble(text, classes) {
    const div = document.createElement("div");
    div.className = "bubble " + classes;
    div.textContent = text; // textContent keeps injected HTML from running
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  function reset() {
    history = [];
    log.replaceChildren();
    addBubble(GREETING, "bot");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    const user = getUser();
    if (!text || busy || !user) return;

    busy = true;
    sendBtn.disabled = true;
    input.value = "";
    addBubble(text, "user");
    const bubble = addBubble("Thinking...", "bot thinking");

    try {
      const reply = await runAgent({ uid: user.uid, text, history });
      bubble.textContent = reply;
      history.push(
        { role: "user", parts: [{ text }] },
        { role: "model", parts: [{ text: reply }] }
      );
      history = history.slice(-MAX_HISTORY_MESSAGES);
    } catch (error) {
      console.error(error);
      bubble.textContent = "Sorry, I couldn't reach the AI right now. Please try again in a moment.";
    } finally {
      bubble.classList.remove("thinking");
      busy = false;
      sendBtn.disabled = false;
      input.focus();
    }
  });

  reset();
  return { reset };
}