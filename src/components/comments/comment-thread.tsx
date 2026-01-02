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
  deleteSupervisorCommentThread,
  getSupervisorCommentsForEntity,
  replyToSupervisorComment,
  getUserById,
  markSupervisorCommentThreadSeen,
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
  onMarkedSeen?: () => void;
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
  onMarkedSeen,
}: CommentThreadProps) {
  const [comments, setComments] = useState<SupervisorComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const baseUrl = useMemo(
    () => (typeof window !== 'undefined' ? window.location.origin : 'https://aire-crm.vercel.app'),
    []
  );
  const entityHref = useMemo(
    () =>
      entityType === 'client'
        ? `${baseUrl}/clients/${entityId}`
        : `${baseUrl}/opportunities?opportunityId=${entityId}`,
    [baseUrl, entityId, entityType]
  );

  const canStartThread = allowedStarterRoles.includes(currentUser.role);

  const loadComments = async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const results = await getSupervisorCommentsForEntity(entityType, entityId);
      setComments(results);
      if (currentUser?.id) {
        await Promise.all(
          results.map(comment => markSupervisorCommentThreadSeen(comment.id, currentUser.id))
        );
        onMarkedSeen?.();
      }
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
    const withLink = `${body}<p><a href="${entityHref}" target="_blank" rel="noopener noreferrer">Abrir en el CRM</a></p>`;
    await sendEmail({ accessToken: token, to: recipient.email, subject, body: withLink });
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

  const canDeleteThread = allowedStarterRoles.includes(currentUser.role);

  const handleDeleteThread = async (comment: SupervisorComment) => {
    if (!canDeleteThread) return;
    const confirmed = window.confirm('¿Eliminar todo el historial de este comentario? Esta acción no se puede deshacer.');
    if (!confirmed) return;
    setDeletingId(comment.id);
    try {
      await deleteSupervisorCommentThread(comment.id, entityType, entityId, ownerId, comment.recipientId);
      setComments(prev => prev.filter(c => c.id !== comment.id));
    } catch (error) {
      console.error('Error deleting comment thread', error);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader className="space-y-1">
        <CardTitle>Comentarios del supervisor</CardTitle>
        <p className="text-sm text-muted-foreground">Comparte indicaciones y respuestas sin salir de la ficha.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner size="small" /> Cargando comentarios...
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay comentarios aún.</p>
        ) : (
          <div className="space-y-4">
            {comments.map(comment => (
              <div key={comment.id} className="rounded-md border bg-muted/40 p-4">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {comment.authorName?.[0] ?? '?'}
                    </div>
                    <div>
                      <p className="text-sm font-semibold leading-tight">{comment.authorName}</p>
                      <p className="text-xs text-muted-foreground">
                        {comment.createdAt ? format(new Date(comment.createdAt), 'PPP p', { locale: es }) : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Comentario inicial</span>
                    {canDeleteThread && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteThread(comment)}
                        disabled={deletingId === comment.id}
                      >
                        {deletingId === comment.id ? <Spinner size="small" /> : 'Eliminar historial'}
                      </Button>
                    )}
                  </div>
                </div>

                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{comment.message}</p>

                {comment.replies && comment.replies.length > 0 && (
                  <div className="mt-4 space-y-3 border-t pt-4">
                    {comment.replies.map(reply => (
                      <div key={reply.id} className="rounded-md bg-background p-3 shadow-sm">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                              {reply.authorName?.[0] ?? '?'}
                            </div>
                            <span className="font-semibold">{reply.authorName}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {reply.createdAt ? format(new Date(reply.createdAt), 'PPP p', { locale: es }) : ''}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{reply.message}</p>
                      </div>
                    ))}
                  </div>
                )}

                {canReply && (
                  <div className="mt-4 space-y-2 rounded-md border bg-background p-3">
                    <Label className="text-xs text-muted-foreground">Responder</Label>
                    <Textarea
                      value={replyDrafts[comment.id] || ''}
                      onChange={(e) => setReplyDrafts(prev => ({ ...prev, [comment.id]: e.target.value }))}
                      placeholder="Escribe tu respuesta"
                    />
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => handleReply(comment)} disabled={savingId === comment.id}>
                        {savingId === comment.id ? <Spinner size="small" /> : 'Enviar respuesta'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {canStartThread && (
          <>
            <Separator />
            <div className="space-y-3 rounded-md border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <Label className="text-sm font-semibold">Nuevo comentario para el asesor</Label>
                  <p className="text-xs text-muted-foreground">Envía indicaciones o pedidos de seguimiento. El asesor recibirá una alerta y un correo.</p>
                </div>
                <a
                  href={entityHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Ver ficha
                </a>
              </div>
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Deja una indicación para el dueño de esta cuenta"
              />
              <div className="flex justify-end">
                <Button onClick={handleCreate} disabled={savingId === 'new'}>
                  {savingId === 'new' ? <Spinner size="small" /> : 'Enviar comentario'}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

