"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  createSupervisorComment,
  getSupervisorCommentsForEntity,
  replyToSupervisorComment,
  getUserById,
} from '@/lib/firebase-service';
import { sendEmail } from '@/lib/google-gmail-service';
import type { SupervisorComment, User } from '@/lib/types';

interface CommentThreadProps {
  entityType: 'client' | 'opportunity';
  entityId: string;
  entityName: string;
  ownerId: string;
  ownerName: string;
  currentUser: User;
  getAccessToken: () => Promise<string | null | undefined>;
}

const allowedStarterRoles: User['role'][] = ['Jefe', 'Gerencia', 'Administracion', 'Admin'];

export function CommentThread({
  entityType,
  entityId,
  entityName,
  ownerId,
  ownerName,
  currentUser,
  getAccessToken,
}: CommentThreadProps) {
  const [comments, setComments] = useState<SupervisorComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const canStartThread = allowedStarterRoles.includes(currentUser.role);

  const loadComments = async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const results = await getSupervisorCommentsForEntity(entityType, entityId);
      setComments(results);
    } catch (error) {
      console.error('Error loading comments', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
  }, [entityId, entityType]);

  const notifyUser = async (userId?: string, subject?: string, body?: string) => {
    if (!userId || !subject || !body) return;
    const recipient = await getUserById(userId);
    if (!recipient?.email) return;
    const token = await getAccessToken();
    if (!token) return;
    await sendEmail({ accessToken: token, to: recipient.email, subject, body });
  };

  const handleCreate = async () => {
    if (!newMessage.trim()) return;
    setSavingId('new');
    try {
      await createSupervisorComment({
        entityType,
        entityId,
        entityName,
        ownerId,
        ownerName,
        authorId: currentUser.id,
        authorName: currentUser.name,
        message: newMessage.trim(),
        recipientId: ownerId,
        recipientName: ownerName,
      });

      await notifyUser(
        ownerId,
        `${entityName}: nuevo comentario`,
        `<p>${currentUser.name} dejó un comentario sobre ${entityName}.</p><p>${newMessage.trim()}</p>`
      );

      setNewMessage('');
      loadComments();
    } catch (error) {
      console.error('Error creating comment', error);
    } finally {
      setSavingId(null);
    }
  };

  const handleReply = async (comment: SupervisorComment) => {
    const draft = replyDrafts[comment.id];
    if (!draft?.trim()) return;
    const recipientId = currentUser.id === comment.authorId ? comment.recipientId || comment.ownerId : comment.authorId;
    const recipientName = currentUser.id === comment.authorId ? comment.recipientName || comment.ownerName : comment.authorName;

    setSavingId(comment.id);
    try {
      await replyToSupervisorComment({
        commentId: comment.id,
        authorId: currentUser.id,
        authorName: currentUser.name,
        message: draft.trim(),
        recipientId: recipientId,
        recipientName,
      });

      await notifyUser(
        recipientId,
        `${entityName}: respuesta a comentario`,
        `<p>${currentUser.name} respondió sobre ${entityName}.</p><p>${draft.trim()}</p>`
      );

      setReplyDrafts(prev => ({ ...prev, [comment.id]: '' }));
      loadComments();
    } catch (error) {
      console.error('Error replying to comment', error);
    } finally {
      setSavingId(null);
    }
  };

  const canReply = useMemo(() => {
    const participants = new Set([ownerId, ...comments.flatMap(c => [c.authorId, c.recipientId].filter(Boolean) as string[])]);
    return participants.has(currentUser.id) || canStartThread;
  }, [comments, currentUser.id, ownerId, canStartThread]);

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Comentarios del supervisor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner size="small" /> Cargando comentarios...
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay comentarios aún.</p>
        ) : (
          <div className="space-y-4">
            {comments.map(comment => (
              <div key={comment.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{comment.authorName}</span>
                  <span className="text-muted-foreground">
                    {comment.createdAt ? format(new Date(comment.createdAt), 'PPP p', { locale: es }) : ''}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{comment.message}</p>
                {comment.replies && comment.replies.length > 0 && (
                  <div className="mt-3 space-y-2 border-l pl-3">
                    {comment.replies.map(reply => (
                      <div key={reply.id} className="text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{reply.authorName}</span>
                          <span className="text-muted-foreground">
                            {reply.createdAt ? format(new Date(reply.createdAt), 'PPP p', { locale: es }) : ''}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap">{reply.message}</p>
                      </div>
                    ))}
                  </div>
                )}

                {canReply && (
                  <div className="mt-3 space-y-2">
                    <Label className="text-xs text-muted-foreground">Responder</Label>
                    <Textarea
                      value={replyDrafts[comment.id] || ''}
                      onChange={(e) => setReplyDrafts(prev => ({ ...prev, [comment.id]: e.target.value }))}
                      placeholder="Escribe tu respuesta"
                    />
                    <Button size="sm" onClick={() => handleReply(comment)} disabled={savingId === comment.id}>
                      {savingId === comment.id ? <Spinner size="small" /> : 'Enviar respuesta'}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {canStartThread && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label>Nuevo comentario para el asesor</Label>
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Deja una indicación para el dueño de esta cuenta"
              />
              <Button onClick={handleCreate} disabled={savingId === 'new'}>
                {savingId === 'new' ? <Spinner size="small" /> : 'Enviar comentario'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

