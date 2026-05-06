## Add Sidebar Navigation and Header to IP Vault

### What changes

**1. Wrap IP Vault page with the same sidebar layout as `/home`**

Update `IPVaultPage.tsx` to include:
- The `Sidebar` component from `src/components/home/Sidebar.tsx` (desktop, hidden on mobile)
- The `MobileSidebarDrawer` component (mobile)
- The `MobileHeader` component (mobile)
- `activeView` state set to `'ip-vault'` so the IP Vault nav item is highlighted

The main content area will use the same `motion.div` wrapper with `marginLeft` animation that `/home` uses, driven by `useSidebar().isCollapsed`.

**2. Add back-chevron + WZRD logo header bar**

Above the existing IP Vault header, add a desktop header bar matching the Home page pattern:
- Left side: A `ChevronLeft` button that navigates back to `/home`, followed by the WZRD logo image and the ALPHA badge
- When the sidebar is collapsed, show a `ChevronRight` button to re-expand it (same as Home)
- Right side: ThemeToggle

**3. Files modified**

| File | Change |
|------|--------|
| `src/components/ip-vault/IPVaultPage.tsx` | Import Sidebar, MobileSidebarDrawer, MobileHeader, useSidebar, wzrdLogo. Wrap content in sidebar layout. Add header bar with back chevron + logo. |

No new files needed. No database changes.
