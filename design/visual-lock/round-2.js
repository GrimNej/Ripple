/* global document, window */

const screens = [...document.querySelectorAll(".screen")];
const reviewIndex = document.querySelector("[data-review-index]");

function activateRoute() {
  const route = window.location.hash.slice(1);
  const target = screens.find((screen) => screen.id === route);

  screens.forEach((screen) => screen.classList.toggle("is-active", screen === target));
  reviewIndex?.classList.toggle("is-hidden", Boolean(target));

  if (target) {
    document.title = `${target.getAttribute("aria-label")} — Ripple`;
    window.scrollTo(0, 0);
  } else {
    document.title = "Ripple — Visual Direction Round 2";
  }
}

function updateTilt(event, scene) {
  const bounds = scene.getBoundingClientRect();
  const normalizedX = (event.clientX - bounds.left) / bounds.width - 0.5;
  const normalizedY = (event.clientY - bounds.top) / bounds.height - 0.5;
  scene.style.setProperty("--tilt-y", `${normalizedX * 4.5}deg`);
  scene.style.setProperty("--tilt-x", `${normalizedY * -4.5}deg`);
}

function clearTilt(scene) {
  scene.style.setProperty("--tilt-y", "0deg");
  scene.style.setProperty("--tilt-x", "0deg");
}

document.querySelectorAll("[data-tilt-scene]").forEach((scene) => {
  scene.addEventListener("pointermove", (event) => updateTilt(event, scene));
  scene.addEventListener("pointerleave", () => clearTilt(scene));
});

document.querySelectorAll("[data-apply]").forEach((button) => {
  button.addEventListener("click", () => {
    button.classList.add("is-applied");
    button.replaceChildren(document.createTextNode(button.dataset.appliedLabel ?? "Applied"));
    button.disabled = true;
  });
});

window.addEventListener("hashchange", activateRoute);
activateRoute();
