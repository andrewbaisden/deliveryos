import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/status-badge";

afterEach(() => cleanup());

describe("StatusBadge", () => {
  it("renders humanised status text", () => {
    render(<StatusBadge value="EN_ROUTE_TO_DROPOFF" />);
    expect(screen.getByText("En route to dropoff")).toBeTruthy();
  });

  it("marks delayed risk as danger", () => {
    const { container } = render(<StatusBadge value="DELAYED" />);
    expect(container.querySelector(".badge.danger")).toBeTruthy();
  });
});
