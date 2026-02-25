import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { AbsoluteFill, getRemotionEnvironment } from "remotion";

const PROJECT_SERVER_URL = "http://localhost:3334";

interface ProjectInfo {
  name: string;
  date: string;
  size: string;
  isCurrent: boolean;
}

interface PipelineProgress {
  step: number;
  totalSteps: number;
  stepName: string;
  status: "running" | "complete" | "error";
  error?: string;
}

interface ProjectSelectorProps {
  onSelectProject: (projectName: string, hasTimingData: boolean) => void;
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  onSelectProject,
}) => {
  const environment = getRemotionEnvironment();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  // Import video state
  const [importing, setImporting] = useState(false);
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Create portal container on mount
  useEffect(() => {
    const containerId = "project-selector-root";
    let container = document.getElementById(containerId);

    if (!container) {
      container = document.createElement("div");
      container.id = containerId;
      document.body.appendChild(container);
    }

    setPortalContainer(container);

    return () => {
      // Cleanup SSE connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Fetch projects list
  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${PROJECT_SERVER_URL}/projects`);
      if (!response.ok) throw new Error("Failed to fetch projects");
      const data = await response.json();
      setProjects(data.projects);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch projects on mount (don't auto-load, let user choose)
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Get default project name (YYYYMMDD)
  const getDefaultProjectName = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  };

  // Handle creating new project
  const handleCreateProject = async () => {
    const name = newProjectName.trim() || getDefaultProjectName();

    try {
      setCreating(true);
      setError(null);

      const response = await fetch(`${PROJECT_SERVER_URL}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const data = await response.json();

      if (data.success) {
        setShowNewProjectDialog(false);
        setNewProjectName("");
        // Don't navigate away - stay on selector to import video
        fetchProjects();
      } else {
        setError(data.error || "Failed to create project");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  // Handle import video button click
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if we have a current project
    const currentResponse = await fetch(`${PROJECT_SERVER_URL}/current`);
    const currentData = await currentResponse.json();

    if (!currentData.name) {
      // Create a new project first
      const name = getDefaultProjectName();
      const createResponse = await fetch(`${PROJECT_SERVER_URL}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const createData = await createResponse.json();
      if (!createData.success) {
        setError(createData.error || "Failed to create project");
        return;
      }
    }

    setImporting(true);
    setError(null);
    setPipelineProgress(null);

    // Connect to SSE for progress updates
    const eventSource = new EventSource(`${PROJECT_SERVER_URL}/pipeline/progress`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.status === "connected") {
        console.log("Connected to pipeline progress");
        return;
      }

      setPipelineProgress(data);

      if (data.status === "complete") {
        eventSource.close();
        eventSourceRef.current = null;
        // Navigate to video editor
        setTimeout(async () => {
          const response = await fetch(`${PROJECT_SERVER_URL}/current`);
          const currentData = await response.json();
          onSelectProject(currentData.name, true);
        }, 500);
      } else if (data.status === "error") {
        eventSource.close();
        eventSourceRef.current = null;
        setError(data.error || "Pipeline failed");
        setImporting(false);
      }
    };

    eventSource.onerror = () => {
      console.error("SSE connection error");
      eventSource.close();
      eventSourceRef.current = null;
    };

    // Upload the file
    try {
      const formData = new FormData();
      formData.append("video", file);

      const response = await fetch(`${PROJECT_SERVER_URL}/import`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || "Failed to import video");
        setImporting(false);
        eventSource.close();
      }
    } catch (err) {
      setError(String(err));
      setImporting(false);
      eventSource.close();
    }

    // Reset file input
    e.target.value = "";
  };

  // Handle loading a project from archive
  const handleLoadProject = async (projectName: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${PROJECT_SERVER_URL}/projects/${encodeURIComponent(projectName)}/load`,
        { method: "POST" }
      );

      const data = await response.json();

      if (data.success) {
        // Check if loaded project has timing data
        const currentResponse = await fetch(`${PROJECT_SERVER_URL}/current`);
        const currentData = await currentResponse.json();
        onSelectProject(projectName, currentData?.hasTimingData || false);
      } else {
        setError(data.error || "Failed to load project");
        setLoading(false);
      }
    } catch (e) {
      setError(String(e));
      setLoading(false);
    }
  };

  // Handle selecting current project
  const handleSelectCurrentProject = async (projectName: string) => {
    // Already current, just check timing data
    try {
      const response = await fetch(`${PROJECT_SERVER_URL}/current`);
      const data = await response.json();
      onSelectProject(projectName, data?.hasTimingData || false);
    } catch (e) {
      onSelectProject(projectName, false);
    }
  };

  // Never render during actual video rendering
  if (environment.isRendering) {
    return null;
  }

  // Don't render until portal container is ready
  if (!portalContainer) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }}>
        <div style={{ color: "#888", textAlign: "center", marginTop: 100 }}>Loading...</div>
      </AbsoluteFill>
    );
  }

  const panel = (
    <div style={overlayStyle}>
      <div style={containerStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <span style={headerIconStyle}>📁</span>
          CaptionsPlease Projects
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />

        {/* Import Video Button - primary action */}
        {!importing && (
          <button style={importButtonStyle} onClick={handleImportClick}>
            📹 Import Video
          </button>
        )}

        {/* Pipeline Progress */}
        {importing && pipelineProgress && (
          <div style={progressContainerStyle}>
            <div style={progressHeaderStyle}>
              {pipelineProgress.status === "running" && "⏳"}
              {pipelineProgress.status === "complete" && "✅"}
              {pipelineProgress.status === "error" && "❌"}
              {" "}
              {pipelineProgress.stepName}
            </div>
            <div style={progressBarContainerStyle}>
              <div
                style={{
                  ...progressBarStyle,
                  width: `${(pipelineProgress.step / pipelineProgress.totalSteps) * 100}%`,
                  backgroundColor:
                    pipelineProgress.status === "error" ? "#ff4444" : "#00FF88",
                }}
              />
            </div>
            <div style={progressStepStyle}>
              Step {pipelineProgress.step} of {pipelineProgress.totalSteps}
            </div>
          </div>
        )}

        {importing && !pipelineProgress && (
          <div style={progressContainerStyle}>
            <div style={progressHeaderStyle}>⏳ Uploading video...</div>
          </div>
        )}

        {/* New Project Button */}
        {!importing && !showNewProjectDialog && (
          <button
            style={newProjectButtonStyle}
            onClick={() => {
              setNewProjectName(getDefaultProjectName());
              setShowNewProjectDialog(true);
            }}
          >
            + New Empty Project
          </button>
        )}

        {!importing && showNewProjectDialog && (
          <div style={newProjectDialogStyle}>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder={getDefaultProjectName()}
              style={inputStyle}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateProject();
                if (e.key === "Escape") setShowNewProjectDialog(false);
              }}
            />
            <div style={dialogButtonsStyle}>
              <button
                style={cancelButtonStyle}
                onClick={() => setShowNewProjectDialog(false)}
              >
                Cancel
              </button>
              <button
                style={createButtonStyle}
                onClick={handleCreateProject}
                disabled={creating}
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && <div style={errorStyle}>{error}</div>}

        {/* Loading state */}
        {loading && !importing && <div style={loadingStyle}>Loading projects...</div>}

        {/* Projects list */}
        {!loading && !importing && projects.length === 0 && (
          <div style={emptyStateStyle}>
            <div style={emptyIconStyle}>📹</div>
            <div style={emptyTextStyle}>No projects yet</div>
            <div style={emptyHintStyle}>
              Click "Import Video" to get started
            </div>
          </div>
        )}

        {!loading && !importing && projects.length > 0 && (
          <div style={projectListStyle}>
            {projects.map((project) => (
              <div
                key={project.name}
                style={projectCardStyle}
                onClick={() => {
                  if (project.isCurrent) {
                    handleSelectCurrentProject(project.name);
                  } else {
                    handleLoadProject(project.name);
                  }
                }}
              >
                <div style={projectCardHeaderStyle}>
                  <span style={projectIconStyle}>📹</span>
                  <span style={projectNameStyle}>{project.name}</span>
                  {project.isCurrent && (
                    <span style={currentBadgeStyle}>Current</span>
                  )}
                </div>
                <div style={projectMetaStyle}>
                  {project.date} · {project.size}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }} />
      {createPortal(panel, portalContainer)}
    </>
  );
};

// Styles
const overlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.85)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 99998,
  fontFamily: "system-ui, sans-serif",
};

const containerStyle: React.CSSProperties = {
  width: 420,
  maxHeight: "80vh",
  backgroundColor: "#1a1a1a",
  borderRadius: 12,
  padding: 24,
  boxShadow: "0 8px 40px rgba(0, 0, 0, 0.6)",
  border: "1px solid #333",
  overflowY: "auto",
};

const headerStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: "#fff",
  marginBottom: 20,
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const headerIconStyle: React.CSSProperties = {
  fontSize: 24,
};

const importButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "16px 20px",
  backgroundColor: "#00FF88",
  border: "none",
  borderRadius: 8,
  color: "#000",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 16,
  marginBottom: 12,
};

const newProjectButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 20px",
  backgroundColor: "#333",
  border: "1px solid #444",
  borderRadius: 8,
  color: "#aaa",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 14,
  marginBottom: 20,
};

const newProjectDialogStyle: React.CSSProperties = {
  backgroundColor: "#222",
  borderRadius: 8,
  padding: 16,
  marginBottom: 20,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  backgroundColor: "#333",
  border: "1px solid #444",
  borderRadius: 6,
  color: "#fff",
  fontSize: 15,
  marginBottom: 12,
  boxSizing: "border-box",
};

const dialogButtonsStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  justifyContent: "flex-end",
};

const cancelButtonStyle: React.CSSProperties = {
  padding: "10px 20px",
  backgroundColor: "#444",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  cursor: "pointer",
  fontSize: 14,
};

const createButtonStyle: React.CSSProperties = {
  padding: "10px 20px",
  backgroundColor: "#00FF88",
  border: "none",
  borderRadius: 6,
  color: "#000",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 14,
};

const progressContainerStyle: React.CSSProperties = {
  backgroundColor: "#222",
  borderRadius: 8,
  padding: 20,
  marginBottom: 20,
};

const progressHeaderStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: "#fff",
  marginBottom: 12,
};

const progressBarContainerStyle: React.CSSProperties = {
  height: 8,
  backgroundColor: "#333",
  borderRadius: 4,
  overflow: "hidden",
  marginBottom: 8,
};

const progressBarStyle: React.CSSProperties = {
  height: "100%",
  borderRadius: 4,
  transition: "width 0.3s ease",
};

const progressStepStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#888",
};

const errorStyle: React.CSSProperties = {
  backgroundColor: "rgba(255, 68, 68, 0.2)",
  border: "1px solid #ff4444",
  borderRadius: 6,
  padding: 12,
  color: "#ff6666",
  fontSize: 14,
  marginBottom: 16,
};

const loadingStyle: React.CSSProperties = {
  textAlign: "center",
  padding: 40,
  color: "#888",
  fontSize: 15,
};

const emptyStateStyle: React.CSSProperties = {
  textAlign: "center",
  padding: 40,
};

const emptyIconStyle: React.CSSProperties = {
  fontSize: 48,
  marginBottom: 16,
};

const emptyTextStyle: React.CSSProperties = {
  color: "#888",
  fontSize: 16,
  marginBottom: 8,
};

const emptyHintStyle: React.CSSProperties = {
  color: "#666",
  fontSize: 13,
  lineHeight: 1.5,
};

const projectListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const projectCardStyle: React.CSSProperties = {
  backgroundColor: "#222",
  borderRadius: 8,
  padding: 16,
  cursor: "pointer",
  transition: "all 0.15s",
  border: "1px solid transparent",
};

const projectCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 6,
};

const projectIconStyle: React.CSSProperties = {
  fontSize: 18,
};

const projectNameStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: "#fff",
  flex: 1,
};

const currentBadgeStyle: React.CSSProperties = {
  backgroundColor: "#00FF88",
  color: "#000",
  fontSize: 11,
  fontWeight: 700,
  padding: "3px 8px",
  borderRadius: 4,
  textTransform: "uppercase",
};

const projectMetaStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#888",
  marginLeft: 28,
};
