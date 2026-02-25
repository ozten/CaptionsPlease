import React, { useState, useCallback, useEffect } from "react";
import { Composition, getInputProps } from "remotion";
import { CaptionedVideo } from "./Video";
import { ProjectSelector } from "./ProjectSelector";
import { CaptionTimingData } from "../types";

type CompositionProps = {
  videoSrc: string;
  position: { x: number; y: number };
  emphasisIndices: number[];
  showControls: boolean;
  captionDataJson: string;
};

const inputProps = getInputProps() as Partial<CompositionProps>;

const PROJECT_SERVER_URL = "http://localhost:3334";

// Main app component that switches between ProjectSelector and CaptionedVideo
const MainApp: React.FC = () => {
  const [currentProject, setCurrentProject] = useState<string | null>(null);
  const [captionData, setCaptionData] = useState<CaptionTimingData | null>(null);
  const [videoFilename, setVideoFilename] = useState<string>("video.mp4");
  const [isLoading, setIsLoading] = useState(false);

  // Handle project selection
  const handleSelectProject = useCallback(async (projectName: string, hasTimingData: boolean) => {
    setIsLoading(true);

    if (hasTimingData) {
      // Fetch caption data from the server
      try {
        const response = await fetch(`${PROJECT_SERVER_URL}/current`);
        const data = await response.json();

        if (data.captionData) {
          setCaptionData(data.captionData);
        }
        if (data.videoFilename) {
          setVideoFilename(data.videoFilename);
        }
      } catch (e) {
        console.error("Failed to fetch caption data:", e);
      }
    }

    setCurrentProject(projectName);
    setIsLoading(false);
  }, []);

  // Handle back to projects
  const handleBackToProjects = useCallback(() => {
    setCurrentProject(null);
    setCaptionData(null);
  }, []);

  // Show ProjectSelector when no project selected
  if (!currentProject) {
    return <ProjectSelector onSelectProject={handleSelectProject} />;
  }

  // Show CaptionedVideo when project is selected
  return (
    <CaptionedVideo
      videoSrc={videoFilename}
      position={captionData?.position || { x: 50, y: 80 }}
      emphasisIndices={[]}
      showControls={true}
      captionDataJson={captionData ? JSON.stringify(captionData) : ""}
      onBackToProjects={handleBackToProjects}
      projectName={currentProject}
    />
  );
};

export const RemotionRoot: React.FC = () => {
  // Legacy mode: when captionDataJson is passed directly via props (for render)
  const isLegacyMode = !!inputProps?.captionDataJson;

  // Parse caption data for legacy mode
  let legacyCaptionData: CaptionTimingData | null = null;
  let durationInFrames = 300;
  let fps = 30;

  if (isLegacyMode && inputProps?.captionDataJson) {
    try {
      legacyCaptionData = JSON.parse(inputProps.captionDataJson);
      durationInFrames = legacyCaptionData?.totalFrames || 300;
      fps = legacyCaptionData?.fps || 30;
    } catch (e) {
      console.error("Failed to parse captionDataJson");
    }
  }

  // Apply position overrides from props (legacy mode)
  if (legacyCaptionData && inputProps?.position) {
    legacyCaptionData = {
      ...legacyCaptionData,
      position: inputProps.position,
    };
  }

  // Apply emphasis overrides (legacy mode)
  const emphasisSet = new Set(inputProps?.emphasisIndices || []);
  if (legacyCaptionData && emphasisSet.size > 0) {
    legacyCaptionData = {
      ...legacyCaptionData,
      allWords: legacyCaptionData.allWords.map((w: any) => ({
        ...w,
        isEmphasis: emphasisSet.has(w.originalIndex),
      })),
      pages: legacyCaptionData.pages.map((p: any) => ({
        ...p,
        words: p.words.map((w: any) => ({
          ...w,
          isEmphasis: emphasisSet.has(w.originalIndex),
        })),
      })),
    };
  }

  // In legacy mode (rendering), show just CaptionedVideo
  if (isLegacyMode) {
    return (
      <Composition
        id="CaptionedVideo"
        component={CaptionedVideo as any}
        durationInFrames={durationInFrames}
        fps={fps}
        width={1080}
        height={1920}
        defaultProps={{
          videoSrc: inputProps?.videoSrc || "video.mp4",
          position: inputProps?.position || legacyCaptionData?.position || { x: 50, y: 80 },
          emphasisIndices: inputProps?.emphasisIndices || [],
          showControls: false,
          captionDataJson: legacyCaptionData ? JSON.stringify(legacyCaptionData) : "",
        }}
      />
    );
  }

  // In studio mode, show MainApp which handles project selection
  return (
    <Composition
      id="CaptionedVideo"
      component={MainApp}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
