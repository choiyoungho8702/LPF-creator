import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import Home from "@/app/page";

test("홈 화면은 제목과 오디오 파일 입력을 보여준다", () => {
  render(<Home />);

  expect(screen.getByRole("heading", { level: 1, name: /LPF Creator/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/오디오 파일/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /실행/i })).toBeDisabled();
});
