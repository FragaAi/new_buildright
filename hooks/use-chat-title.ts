import { useState, useCallback } from 'react';
import { updateChatTitle } from '@/app/(chat)/actions';
import { toast } from '@/components/toast';
import { useSWRConfig } from 'swr';

export function useChatTitle({
  chatId,
  initialTitle,
}: {
  chatId: string;
  initialTitle: string;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const { mutate } = useSWRConfig();

  const startEditing = useCallback(() => {
    setIsEditing(true);
  }, []);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setTitle(initialTitle); // Reset to original title
  }, [initialTitle]);

  const saveTitle = useCallback(async (newTitle: string) => {
    if (!newTitle.trim()) {
      toast({
        type: 'error',
        description: 'Title cannot be empty',
      });
      return;
    }

    if (newTitle.trim() === initialTitle) {
      setIsEditing(false);
      return;
    }

    setIsUpdating(true);
    try {
      await updateChatTitle({ chatId, title: newTitle.trim() });
      setTitle(newTitle.trim());
      setIsEditing(false);
      
      // Refresh the sidebar history to show updated title
      mutate((key) => typeof key === 'string' && key.includes('/api/history'));
      
      toast({
        type: 'success',
        description: 'Chat title updated successfully',
      });
    } catch (error) {
      toast({
        type: 'error',
        description: 'Failed to update chat title',
      });
      console.error('Failed to update chat title:', error);
    } finally {
      setIsUpdating(false);
    }
  }, [chatId, initialTitle, mutate]);

  return {
    title,
    setTitle,
    isEditing,
    isUpdating,
    startEditing,
    cancelEditing,
    saveTitle,
  };
} 