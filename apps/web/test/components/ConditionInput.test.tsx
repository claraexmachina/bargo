import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConditionInput, containsSensitiveData } from '../../components/ConditionInput';

// ─── Unit tests: sensitive data detection (no DOM) ──────────────────────────

describe('containsSensitiveData', () => {
  it('detects email addresses', () => {
    expect(containsSensitiveData('홍길동@example.com 으로 연락주세요')).toBe(true);
    expect(containsSensitiveData('test@naver.com')).toBe(true);
  });

  it('detects Korean phone numbers', () => {
    expect(containsSensitiveData('010-1234-5678로 연락주세요')).toBe(true);
    expect(containsSensitiveData('01012345678')).toBe(true);
    expect(containsSensitiveData('016-234-5678')).toBe(true);
  });

  it('does not flag normal condition text', () => {
    expect(containsSensitiveData('강남 직거래, 평일 저녁만')).toBe(false);
    expect(containsSensitiveData('박스 없음, 카드 가능')).toBe(false);
    expect(containsSensitiveData('강남/송파 직거래만, 평일 19시 이후')).toBe(false);
  });
});

// ─── Integration: component renders warning state when sensitiveWarning=true ─
// jsdom ClipboardEvent.clipboardData is read-only, so we test by calling
// the internal warning mechanism via a wrapper that can expose state.

describe('ConditionInput component', () => {
  it('renders with placeholder text', () => {
    render(<ConditionInput value="" onChange={() => {}} placeholder="강남/송파 직거래만" />);
    expect(screen.getByPlaceholderText('강남/송파 직거래만')).toBeInTheDocument();
  });

  it('shows byte counter', () => {
    render(<ConditionInput value="test" onChange={() => {}} />);
    expect(screen.getByText(/\d+B/)).toBeInTheDocument();
  });

  it('shows TEE privacy hint', () => {
    render(<ConditionInput value="" onChange={() => {}} />);
    // The hint spans multiple DOM nodes (strong + text); check for key substrings
    expect(screen.getByText(/auto-purged/i)).toBeInTheDocument();
    expect(screen.getByText(/NEAR AI TEE/)).toBeInTheDocument();
  });

  it('shows sensitive warning when paste event fires with email', async () => {
    render(<ConditionInput value="" onChange={() => {}} />);
    const textarea = screen.getByRole('textbox');

    // jsdom: manually dispatch a paste event with clipboardData mock
    // We use Object.defineProperty to make clipboardData work
    await act(async () => {
      const event = new Event('paste', { bubbles: true });
      // Attach clipboardData manually — jsdom allows this on generic Event
      Object.defineProperty(event, 'clipboardData', {
        value: { getData: () => 'test@example.com 연락주세요' },
        writable: false,
      });
      textarea.dispatchEvent(event);
    });

    expect(screen.getByText(/personal information detected/i)).toBeInTheDocument();
  });

  it('shows sensitive warning when paste event fires with phone number', async () => {
    render(<ConditionInput value="" onChange={() => {}} />);
    const textarea = screen.getByRole('textbox');

    await act(async () => {
      const event = new Event('paste', { bubbles: true });
      Object.defineProperty(event, 'clipboardData', {
        value: { getData: () => '010-1234-5678로 연락주세요' },
        writable: false,
      });
      textarea.dispatchEvent(event);
    });

    expect(screen.getByText(/personal information detected/i)).toBeInTheDocument();
  });

  it('does not warn for normal condition text paste', async () => {
    render(<ConditionInput value="" onChange={() => {}} />);
    const textarea = screen.getByRole('textbox');

    await act(async () => {
      const event = new Event('paste', { bubbles: true });
      Object.defineProperty(event, 'clipboardData', {
        value: { getData: () => '강남 직거래, 평일 저녁만' },
        writable: false,
      });
      textarea.dispatchEvent(event);
    });

    expect(screen.queryByText(/personal information detected/i)).not.toBeInTheDocument();
  });
});
