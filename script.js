
document.addEventListener("DOMContentLoaded", () => {
    const cards = document.querySelectorAll(".tool-card");

    cards.forEach((card) => {
        card.addEventListener("click", () => {
            console.log("Opening:", card.querySelector("h3").textContent);
        });
    });
});
