
// =========================================================
// GYANSIFY HRMS — SHARED DASHBOARD INTERACTIONS
// =========================================================

(function () {
    "use strict";

    function initializeDashboard() {
        const sidebar = document.getElementById("hrmsSidebar");
        const overlay = document.getElementById("hrmsSidebarOverlay");
        const menuButton = document.getElementById("hrmsMobileMenuButton");

        if (!sidebar || !overlay) {
            return;
        }

        // Prevent duplicate event listeners.
        if (sidebar.dataset.jsInitialized === "true") {
            return;
        }

        sidebar.dataset.jsInitialized = "true";

        const mobileBreakpoint = 1100;

        function isMobileLayout() {
            return window.innerWidth <= mobileBreakpoint;
        }

        function openSidebar() {
            if (!isMobileLayout()) {
                return;
            }

            sidebar.classList.add("open");
            overlay.classList.add("show");
            overlay.setAttribute("aria-hidden", "false");
            document.body.style.overflow = "hidden";

            if (menuButton) {
                menuButton.setAttribute("aria-expanded", "true");
                menuButton.setAttribute("aria-label", "Close navigation menu");
            }
        }

        function closeSidebar(restoreFocus = false) {
            sidebar.classList.remove("open");
            overlay.classList.remove("show");
            overlay.setAttribute("aria-hidden", "true");
            document.body.style.overflow = "";

            if (menuButton) {
                menuButton.setAttribute("aria-expanded", "false");
                menuButton.setAttribute("aria-label", "Open navigation menu");

                if (restoreFocus && isMobileLayout()) {
                    menuButton.focus();
                }
            }
        }

        if (menuButton) {
            menuButton.addEventListener("click", function () {
                if (sidebar.classList.contains("open")) {
                    closeSidebar();
                } else {
                    openSidebar();
                }
            });
        }

        overlay.addEventListener("click", function () {
            closeSidebar(true);
        });

        document.addEventListener("keydown", function (event) {
            if (
                event.key === "Escape" &&
                sidebar.classList.contains("open")
            ) {
                closeSidebar(true);
            }
        });

        sidebar.addEventListener("click", function (event) {
            const link = event.target.closest(".hrms-menu-item");

            if (link && isMobileLayout()) {
                closeSidebar();
            }
        });

        document.addEventListener("click", function (event) {
            if (!sidebar.classList.contains("open")) {
                return;
            }

            const clickedInsideSidebar = sidebar.contains(event.target);
            const clickedMenuButton =
                menuButton && menuButton.contains(event.target);

            if (!clickedInsideSidebar && !clickedMenuButton) {
                closeSidebar();
            }
        });

        window.addEventListener("resize", function () {
            if (!isMobileLayout()) {
                closeSidebar();
            }
        });

        // Optional shared API for other page scripts.
        window.GyansifyHRMS = window.GyansifyHRMS || {};
        window.GyansifyHRMS.openSidebar = openSidebar;
        window.GyansifyHRMS.closeSidebar = closeSidebar;
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initializeDashboard,
            { once: true }
        );
    } else {
        initializeDashboard();
    }
})();
