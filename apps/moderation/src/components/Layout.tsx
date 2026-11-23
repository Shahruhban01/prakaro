import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Activity,
  Bell,
  Building2,
  ClipboardList,
  Layers3,
  LayoutDashboard,
  Menu,
  ParkingCircle,
  ShieldCheck,
  UsersRound,
  Workflow,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { api, useData, type Actor } from "../api";
import { useAttendanceControl } from "../attendanceApi";
import { GlobalAuxControl } from "./GlobalAuxControl";

export function Layout() {
  const session = useData<Actor>("/session");
  const attendance=useAttendanceControl(session.data);
  const [logoutError,setLogoutError]=useState<string>();
  const [signingOut,setSigningOut]=useState(false);
  const [sidebar, setSidebar] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const sessionDenied = session.isError && axios.isAxiosError(session.error) &&
    [401, 403].includes(session.error.response?.status ?? 0);
  const needsLogin = attendance.expired || sessionDenied;
  useEffect(() => {
    if (!needsLogin) return;
    sessionStorage.removeItem("prakaro_auth_token");
    delete api.defaults.headers.common.Authorization;
    queryClient.clear();
    navigate("/login", { replace: true });
  }, [needsLogin, navigate, queryClient]);
  async function logout() {
    if(signingOut)return;
    setSigningOut(true);
    setLogoutError(undefined);
    try{
      const domain=session.data?.superAdmin?'super-admin-auth':'moderator-auth';
      await axios.post('/api/'+domain+'/sign-out',{},{headers:{'X-Prakaro-Console':'1'},timeout:5000});
    }catch(error){
      if(!axios.isAxiosError(error)||error.response?.status!==401){
        setLogoutError(axios.isAxiosError(error)?error.response?.data?.error?.message??'Sign-out failed. Try again.':'Sign-out failed. Try again.');
        return;
      }
    }finally{setSigningOut(false);}
    sessionStorage.removeItem("prakaro_auth_token");
    delete api.defaults.headers.common.Authorization;
    queryClient.clear();
    navigate("/login", { replace: true });
  }
  if (needsLogin) return <main className="workspace-loading" role="status">Session ended. Returning to sign-in…</main>;
  if (session.isLoading)
    return (
      <main className="workspace-loading" role="status">
        Loading workspace…
      </main>
    );
  const actor = session.data;
  if (!actor)
    return (
      <main className="workspace-loading">
        <p>Workspace unavailable.</p>
        <button onClick={() => session.refetch()}>Retry</button>
      </main>
    );
  const director = ["ADMIN", "MODERATION_ADMIN"].includes(actor.role);
  const leader = [
    "MANAGER",
    "MODERATION_MANAGER",
    "SUPERVISOR",
    "MOD_SUPERVISOR",
    "QA_SUPERVISOR",
  ].includes(actor.role);
  const groups = [
    {
      label: "Overview",
      items: [
        {
          to: "/dashboard",
          label: actor.superAdmin ? "Global dashboard" : "Dashboard",
          icon: LayoutDashboard,
        },
        ...(!actor.superAdmin?[{to:"/my-attendance",label:"My attendance",icon:Activity}]:[]),
        ...(actor.superAdmin||director||leader?[{to:"/workforce/aux",label:"Workforce AUX",icon:UsersRound}]:[]),
        { to: "/operations/schedule", label: "Workforce schedule", icon: UsersRound },
        ...(actor.superAdmin || director || leader ? [{ to: "/operations/overview", label: "Executive operations", icon: LayoutDashboard }] : []),
        { to: actor.superAdmin || director || leader ? "/analytics" : "/analytics/my-performance",
          label: actor.superAdmin || director || leader ? "Performance" : "My performance", icon: Activity },
      ],
    },
    {
      label: "Organization",
      items: [
        ...(actor.superAdmin || director
          ? [{ to: "/organizations", label: "Organizations", icon: Building2 }]
          : []),
        ...(actor.superAdmin || director || leader
          ? [
              { to: "/lobs", label: "Lines of business", icon: Layers3 },
              {
                to: "/staff",
                label: leader ? "Team members" : "Employees",
                icon: UsersRound,
              },
              {
                to: "/teams",
                label: leader ? "My teams" : "Teams",
                icon: Workflow,
              },
            ]
          : []),
      ],
    },
    {
      label: "Operations",
      items: [
        ...(actor.role === "MODERATOR"
          ? [{to:"/my-queues",label:"My Subscribed Queues",icon:ClipboardList},{to:"/available-queues",label:"Available Queues",icon:Layers3}]
          : [{to:"/queues",label:"Queues",icon:Layers3}]),
        { to: "/qa", label: "Quality", icon: ShieldCheck },
        { to: "/policies", label: "Policies", icon: ClipboardList },
        { to: "/clarifications", label: "Clarifications", icon: Workflow },
        ...(actor.superAdmin || leader
          ? [
              { to: "/escalations", label: "Escalations", icon: Workflow },
            ]
          : []),
      ],
    },
    {
      label: "Platform",
      items: actor.superAdmin
        ? [
            { to: "/settings/ai", label: "AI providers", icon: Activity },
            {
              to: "/settings/permissions",
              label: "Permissions",
              icon: ShieldCheck,
            },
            { to: "/audit-log", label: "Audit log", icon: ClipboardList },
          ]
        : [],
    },
  ];
  return (
    <div className="workforce-shell">
      <aside
        id="workforce-sidebar"
        className={
          sidebar ? "workforce-sidebar sidebar-open" : "workforce-sidebar"
        }
      >
        <div className="workspace-brand">
          <ParkingCircle size={27} />
          <div>
            <strong>Prakaro</strong>
            <small>Moderation operations</small>
          </div>
          <button
            className="mobile-menu"
            aria-label="Close navigation"
            onClick={() => setSidebar(false)}
          >
            <X size={18} />
          </button>
        </div>
        <nav aria-label="Workspace navigation">
          {groups
            .filter((group) => group.items.length)
            .map((group) => (
              <div key={group.label} className="nav-group">
                <span>{group.label}</span>
                {group.items.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to} onClick={() => setSidebar(false)}>
                    <Icon size={16} />
                    {label}
                  </NavLink>
                ))}
              </div>
            ))}
        </nav>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <div className="header-context">
            <button
              aria-label="Open navigation"
              aria-expanded={sidebar}
              aria-controls="workforce-sidebar"
              className="mobile-menu"
              onClick={() => setSidebar(!sidebar)}
            >
              <Menu size={19} />
            </button>
            <span>{actor.organization ?? "Platform"}</span>
            {actor.lob && <small>{actor.lob}</small>}
          </div>
          <div className="header-actions">
            <GlobalAuxControl state={attendance.state} onPunch={attendance.punch} />
            <details>
              <summary aria-label="Notifications">
                <Bell size={17} />
              </summary>
              <div className="header-popover">
                Notifications are unavailable.
              </div>
            </details>
            <details>
              <summary aria-label="Account menu">
                <span className="avatar">
                  {(actor.name ?? actor.role).slice(0, 2).toUpperCase()}
                </span>
              </summary>
              <div className="header-popover">
                <strong>{actor.name}</strong>
                <p>{actor.role.replaceAll("_", " ")}</p>
                <button disabled={signingOut} onClick={logout}>{signingOut?"Signing out…":"Sign out"}</button>
                {logoutError&&<p role="alert">{logoutError}</p>}
              </div>
            </details>
          </div>
        </header>
        <main className="workspace-main">
          <Outlet context={attendance.snapshot} />
        </main>
      </div>
    </div>
  );
}
