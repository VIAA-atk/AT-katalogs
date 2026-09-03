import("./admin.js?v=4").catch((error) => {
  const status = document.querySelector("#auth-status");
  if (!status) return;
  status.textContent = `Administratora paneļa kodu neizdevās ielādēt. ${error.message}`;
  status.classList.add("error");
  status.hidden = false;
});
