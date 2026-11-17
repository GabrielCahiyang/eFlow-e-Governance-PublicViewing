import { useCallback, useEffect, useState } from "react";
import { CertificatesDirectory } from "./components/CertificatesDirectory";
import { PortalHeader, type PortalRoute } from "./components/PortalHeader";
import { ProjectRecordView } from "./components/ProjectRecordView";
import {
  listPublicCertificates,
  subscribeToPublicCertificates,
} from "./services/publicRecordService";
import type { PublicCertificate } from "./types";

function parseRouteFromLocation(pathname = window.location.pathname): PortalRoute {
  const match = pathname.match(/^\/(?:public\/)?project-record\/([0-9a-f-]+)\/?$/i);
  if (match) {
    return { view: "record", certificateId: match[1] };
  }
  return { view: "directory" };
}

function routeToPath(route: PortalRoute): string {
  if (route.view === "record") {
    return `/project-record/${encodeURIComponent(route.certificateId)}`;
  }
  return "/";
}

export function App() {
  const [route, setRoute] = useState<PortalRoute>(() => parseRouteFromLocation());
  const [certificates, setCertificates] = useState<PublicCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const navigate = useCallback((next: PortalRoute) => {
    const nextPath = routeToPath(next);
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, "", nextPath);
    }
    setRoute(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const refreshRegistry = useCallback(() => {
    setLoading(true);
    setError("");
    void listPublicCertificates()
      .then((rows) => setCertificates(rows))
      .catch((err: unknown) =>
        setError(
          err instanceof Error
            ? err.message
            : "Could not load sealed projects.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshRegistry();
    const unsubscribe = subscribeToPublicCertificates(refreshRegistry);

    const onPopState = () => setRoute(parseRouteFromLocation());
    window.addEventListener("popstate", onPopState);

    return () => {
      unsubscribe();
      window.removeEventListener("popstate", onPopState);
    };
  }, [refreshRegistry]);

  return (
    <div className="portal-shell">
      <PortalHeader onHome={() => navigate({ view: "directory" })} />

      <main className="portal-main">
        {route.view === "directory" ? (
          <CertificatesDirectory
            certificates={certificates}
            loading={loading}
            error={error}
            onSelectCertificate={(certificateId) =>
              navigate({ view: "record", certificateId })
            }
          />
        ) : (
          <ProjectRecordView
            certificateId={route.certificateId}
            onBack={() => navigate({ view: "directory" })}
            onOpenCertificate={(certificateId) =>
              navigate({ view: "record", certificateId })
            }
          />
        )}
      </main>
    </div>
  );
}

export default App;
