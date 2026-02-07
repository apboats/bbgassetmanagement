// ============================================================================
// MENTION INPUT COMPONENT
// ============================================================================
// Textarea with @mention support for tagging users
// Typing @ shows a dropdown of users to select from
// Mentions are stored as @[Name](userId) in the text
// ============================================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send } from 'lucide-react';

// Parse mentions from text and render with highlighting
export function renderMessageWithMentions(text, currentUserId) {
  if (!text) return null;

  // Match @[Name](userId) pattern
  const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex, match.index)
      });
    }

    // Add the mention
    parts.push({
      type: 'mention',
      name: match[1],
      userId: match[2],
      isCurrentUser: match[2] === currentUserId
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.slice(lastIndex)
    });
  }

  if (parts.length === 0) {
    return <span className="whitespace-pre-wrap">{text}</span>;
  }

  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.type === 'mention') {
          return (
            <span
              key={i}
              className={`font-semibold ${
                part.isCurrentUser ? 'text-yellow-300' : 'text-blue-300'
              }`}
            >
              @{part.name}
            </span>
          );
        }
        return <span key={i}>{part.content}</span>;
      })}
    </span>
  );
}

// Extract mentioned user IDs from text
export function extractMentionedUserIds(text) {
  if (!text) return [];
  const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const userIds = [];
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    userIds.push(match[2]);
  }

  return [...new Set(userIds)]; // Remove duplicates
}

export function MentionInput({
  value,
  onChange,
  onSubmit,
  users = [],
  placeholder = "Type a message... Use @ to mention someone",
  disabled = false,
  submitDisabled = false,
  rows = 1,
  className = "",
}) {
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);

  // Filter users based on search
  const filteredUsers = users.filter(user => {
    if (!mentionSearch) return true;
    const search = mentionSearch.toLowerCase();
    return (
      user.name?.toLowerCase().includes(search) ||
      user.username?.toLowerCase().includes(search)
    );
  }).slice(0, 5); // Limit to 5 suggestions

  // Handle text change and detect @ mentions
  const handleChange = useCallback((e) => {
    const newValue = e.target.value;
    const cursor = e.target.selectionStart;
    setCursorPosition(cursor);
    onChange(newValue);

    // Check if we're in a mention context (@ followed by text, not inside existing mention)
    const textBeforeCursor = newValue.slice(0, cursor);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      // Check if there's a space or newline after the @, which would end the mention
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        // Check we're not inside an existing mention like @[Name](id)
        const beforeAt = textBeforeCursor.slice(0, lastAtIndex);
        const openBrackets = (beforeAt.match(/\[/g) || []).length;
        const closeBrackets = (beforeAt.match(/\]/g) || []).length;

        if (openBrackets === closeBrackets) {
          setMentionSearch(textAfterAt);
          setShowMentions(true);
          setMentionIndex(0);
          return;
        }
      }
    }

    setShowMentions(false);
    setMentionSearch('');
  }, [onChange]);

  // Handle selecting a user from the dropdown
  const selectUser = useCallback((user) => {
    const textBeforeCursor = value.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    const textAfterCursor = value.slice(cursorPosition);

    // Build the mention text
    const mention = `@[${user.name}](${user.id})`;

    // Replace @search with the mention
    const newValue = value.slice(0, lastAtIndex) + mention + ' ' + textAfterCursor;
    onChange(newValue);

    setShowMentions(false);
    setMentionSearch('');

    // Focus back on textarea
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = lastAtIndex + mention.length + 1;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }, [value, cursorPosition, onChange]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (showMentions && filteredUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % filteredUsers.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + filteredUsers.length) % filteredUsers.length);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        selectUser(filteredUsers[mentionIndex]);
      } else if (e.key === 'Escape') {
        setShowMentions(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (onSubmit && !submitDisabled) {
        onSubmit();
      }
    }
  }, [showMentions, filteredUsers, mentionIndex, selectUser, onSubmit, submitDisabled]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          textareaRef.current && !textareaRef.current.contains(e.target)) {
        setShowMentions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={rows}
            disabled={disabled}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
          />

          {/* Mention dropdown */}
          {showMentions && filteredUsers.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute bottom-full left-0 mb-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto"
            >
              {filteredUsers.map((user, index) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => selectUser(user)}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                    index === mentionIndex
                      ? 'bg-blue-50 text-blue-700'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                    {user.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{user.name}</p>
                    {user.role && (
                      <p className="text-xs text-slate-500 capitalize">{user.role.replace('-', ' ')}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {showMentions && filteredUsers.length === 0 && mentionSearch && (
            <div
              ref={dropdownRef}
              className="absolute bottom-full left-0 mb-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-50 p-3"
            >
              <p className="text-sm text-slate-500 text-center">No users found</p>
            </div>
          )}
        </div>

        {onSubmit && (
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitDisabled || disabled}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default MentionInput;
