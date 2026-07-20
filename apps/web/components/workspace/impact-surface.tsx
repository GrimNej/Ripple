"use client";

import dagre, { type EdgeConfig, type GraphLabel, type NodeConfig } from "@dagrejs/dagre";
import { useQuery } from "@tanstack/react-query";
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { ArrowRight, Check, CircleHelp, FileText, List, Network, ShieldCheck } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";

import { apiRequest } from "../../lib/api";
import { graphRowSchema, type GraphRow } from "../../lib/contracts";
import { EmptySurface, SurfaceError, SurfaceLoading } from "./surface-state";
import { surfaceError, type SurfaceProperties } from "./surface-types";

const NODE_WIDTH = 230;
const NODE_HEIGHT = 76;

function humanize(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

function layoutGraph(rows: GraphRow[]): { nodes: Node[]; edges: Edge[] } {
  const graph = new dagre.graphlib.Graph<GraphLabel, NodeConfig, EdgeConfig>();
  graph.setGraph({ marginx: 32, marginy: 32, nodesep: 42, rankdir: "LR", ranksep: 90 });
  graph.setDefaultEdgeLabel(() => ({}));
  const sourceNode: Node = {
    data: { label: "Authoritative source" },
    id: "source",
    position: { x: 0, y: 0 },
    type: "input",
  };
  const nodes = new Map<string, Node>([[sourceNode.id, sourceNode]]);
  const edges: Edge[] = [];

  for (const row of rows) {
    const atomId = `atom-${row.changeAtomId}`;
    const assetId = `asset-${row.assetId}`;
    nodes.set(atomId, {
      className: "flow-node flow-node--change",
      data: { label: `${humanize(row.changeType)}: ${row.newClaim}` },
      id: atomId,
      position: { x: 0, y: 0 },
    });
    nodes.set(assetId, {
      className: `flow-node flow-node--${row.status.toLowerCase()}`,
      data: { label: row.assetTitle },
      id: assetId,
      position: { x: 0, y: 0 },
    });
    if (!edges.some((edge) => edge.id === `source-${atomId}`)) {
      edges.push({ id: `source-${atomId}`, source: "source", target: atomId });
    }
    edges.push({
      data: { findingId: row.findingId },
      id: row.findingId,
      label: humanize(row.status),
      markerEnd: { type: MarkerType.ArrowClosed },
      source: atomId,
      target: assetId,
    });
  }

  for (const node of nodes.values())
    graph.setNode(node.id, { height: NODE_HEIGHT, width: NODE_WIDTH });
  for (const edge of edges) graph.setEdge(edge.source, edge.target);
  // Dagre 3 exposes two structurally compatible Graph declarations that TypeScript cannot unify.
  dagre.layout(graph as never);
  const positioned = [...nodes.values()].map((node) => {
    const position = graph.node(node.id) as { x: number; y: number };
    return {
      ...node,
      position: { x: position.x - NODE_WIDTH / 2, y: position.y - NODE_HEIGHT / 2 },
    };
  });
  return { edges, nodes: positioned };
}

export function ImpactSurface(properties: SurfaceProperties) {
  const reducedMotion = useReducedMotion();
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const graphQuery = useQuery({
    enabled: Boolean(properties.runId),
    queryKey: ["graph", properties.runId],
    queryFn: () => apiRequest(`/api/runs/${properties.runId}/graph`, graphRowSchema.array()),
  });
  const error =
    surfaceError(properties) ?? (graphQuery.error instanceof Error ? graphQuery.error : null);
  const rows = useMemo(() => graphQuery.data ?? [], [graphQuery.data]);
  const graph = useMemo(() => layoutGraph(rows), [rows]);
  const edges = useMemo(
    () =>
      graph.edges.map((edge) => ({
        ...edge,
        animated: !reducedMotion && edge.id === selectedFindingId,
        className: edge.id === selectedFindingId ? "is-selected" : "",
      })),
    [graph.edges, reducedMotion, selectedFindingId],
  );
  const selected = rows.find((row) => row.findingId === selectedFindingId) ?? rows[0];

  if (properties.dashboard.isPending || graphQuery.isPending) return <SurfaceLoading />;
  if (error)
    return (
      <SurfaceError
        error={error}
        retry={() => {
          void graphQuery.refetch();
          void properties.dashboard.refetch();
        }}
      />
    );
  if (!properties.runId || rows.length === 0) {
    return (
      <EmptySurface
        body="A completed change event will reveal its evidence-backed relationships here."
        title="No impact map is available."
      />
    );
  }

  return (
    <div className="surface impact-surface">
      <header className="surface-heading split-heading">
        <div>
          <p className="eyebrow">Impact view / {rows.length} relationships</p>
          <h1>
            Every edge carries
            <br />
            <em>its evidence.</em>
          </h1>
        </div>
        <div className="heading-status">
          <span>
            <ShieldCheck size={15} />
            Graph and list in parity
          </span>
          <small>Select a relationship to inspect it</small>
        </div>
      </header>

      <div className="impact-layout">
        <section aria-labelledby="impact-map-title" className="impact-map panel">
          <header className="panel-header">
            <div>
              <span>Downstream map</span>
              <h2 id="impact-map-title">Causal relationships</h2>
            </div>
            <span className="map-mode">
              <Network size={15} />
              Interactive map
            </span>
          </header>
          <div className="flow-canvas">
            <ReactFlow
              edges={edges}
              fitView
              fitViewOptions={{ padding: 0.18 }}
              maxZoom={1.5}
              minZoom={0.45}
              nodes={graph.nodes}
              nodesConnectable={false}
              nodesDraggable={false}
              onEdgeClick={(_event, edge) => setSelectedFindingId(edge.id)}
              onNodeClick={(_event, node) => {
                const row = rows.find(
                  (candidate) =>
                    node.id === `asset-${candidate.assetId}` ||
                    node.id === `atom-${candidate.changeAtomId}`,
                );
                if (row) setSelectedFindingId(row.findingId);
              }}
              proOptions={{ hideAttribution: true }}
              zoomOnDoubleClick={false}
            >
              <Background color="#313638" gap={28} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
          {selected && (
            <div aria-live="polite" className="edge-inspector">
              <span className={`status-label status-label--${selected.status.toLowerCase()}`}>
                {selected.status === "CONFIRMED" ? <Check /> : <CircleHelp />}
                {humanize(selected.status)}
              </span>
              <p>
                <b>{selected.newClaim}</b>
                <ArrowRight size={14} />
                <span>{selected.assetTitle}</span>
              </p>
              <small>
                {humanize(selected.impactType)} · severity {humanize(selected.severity)}
              </small>
            </div>
          )}
        </section>

        <section aria-labelledby="evidence-list-title" className="evidence-list panel">
          <header className="panel-header">
            <div>
              <span>Accessible evidence list</span>
              <h2 id="evidence-list-title">The same relationships</h2>
            </div>
            <List size={18} />
          </header>
          <ol>
            {rows.map((row, index) => (
              <li
                className={selected?.findingId === row.findingId ? "is-selected" : ""}
                key={row.findingId}
              >
                <button onClick={() => setSelectedFindingId(row.findingId)} type="button">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <small>{humanize(row.changeType)}</small>
                    <b>{row.assetTitle}</b>
                    <p>
                      {row.oldClaim}
                      <ArrowRight size={12} />
                      {row.newClaim}
                    </p>
                  </div>
                  <span className={`evidence-state evidence-state--${row.status.toLowerCase()}`}>
                    {humanize(row.status)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <footer>
            <FileText size={14} />
            <span>Every confirmed relationship owns validated source and asset evidence.</span>
          </footer>
        </section>
      </div>

      <div className="surface-next">
        <span>
          <b>Next</b>Review the exact repair before any asset changes.
        </span>
        <a className="button" href="/workspace/review">
          Open patch review <ArrowRight size={16} />
        </a>
      </div>
    </div>
  );
}
