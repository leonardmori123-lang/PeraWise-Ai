import { runAgent } from "./ai-agent.js";

const MAX_CHAT_LINES = 8;
const INITIAL_MESSAGE =
  'Hi! Tell me what you spent, like "spent 150 on lunch". I also track who owes whom: try "Ana owes me 200" or "I paid 900, split with Ben and Cris".';

export function initChat(getUser, getFriends = () => []) {
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");
  const chatLog = document.getElementById("chat-log");

  let chatHistory = [];
  let isSubmitting = false;

  function addBubble(text, className) {
    const bubbleDiv = document.createElement("div");
    bubbleDiv.className = "bubble " + className;
    bubbleDiv.textContent = text;
    chatLog.appendChild(bubbleDiv);
    chatLog.scrollTop = chatLog.scrollHeight;
    return bubbleDiv;
  }

  function reset() {
    chatHistory = [];
    chatLog.replaceChildren();
    addBubble(INITIAL_MESSAGE, "bot");
  }

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const userText = chatInput.value.trim();
    const user = getUser();
    if (!userText || isSubmitting || !user) return;

    isSubmitting = true;
    sendBtn.disabled = true;
    chatInput.value = "";
    addBubble(userText, "user");
    const waitBubble = addBubble("Thinking...", "bot thinking");

    try {
      const aiResponse = await runAgent({ uid: user.uid, text: userText, history: chatHistory, friends: getFriends() });
      waitBubble.textContent = aiResponse;
      chatHistory.push(
        { role: "user", parts: [{ text: userText }] },
        { role: "model", parts: [{ text: aiResponse }] }
      );
      chatHistory = chatHistory.slice(-MAX_CHAT_LINES);
    } catch (error) {
      console.error(error);
      waitBubble.textContent = "Sorry, I couldn't reach the AI right now. Please try again in a moment.";
    } finally {
      waitBubble.classList.remove("thinking");
      isSubmitting = false;
      sendBtn.disabled = false;
      chatInput.focus();
    }
  });

  reset();
  return { reset };
}
