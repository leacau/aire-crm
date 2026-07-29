import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthProvider';
import { claimProspect, createProspect, getProspects, updateProspect } from '../lib/api';
import type { Prospect, ProspectStatus } from '../lib/types';
import { LoadingScreen } from './LoadingScreen';

type ProspectFilter = 'mine' | 'free' | 'all';
const statusOptions: ProspectStatus[] = ['Nuevo', 'Contactado', 'Calificado', 'No Próspero', 'Convertido'];

function formatDate(value?: string) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return parsed.toLocaleDateString('es-AR');
}

function getStatusStyle(status: string) {
  if (status === 'Convertido') return styles.statusConverted;
  if (status === 'Calificado') return styles.statusQualified;
  if (status === 'Contactado') return styles.statusContacted;
  if (status.includes('No')) return styles.statusLost;
  return styles.statusNew;
}

async function openLink(url: string, fallbackMessage: string) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('No se pudo abrir', fallbackMessage);
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert('No se pudo abrir', fallbackMessage);
  }
}

export function ProspectsScreen() {
  const { firebaseUser, session } = useAuth();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [filter, setFilter] = useState<ProspectFilter>('mine');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [sector, setSector] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [editStatus, setEditStatus] = useState<ProspectStatus>('Nuevo');
  const [editContactName, setEditContactName] = useState('');
  const [editContactPhone, setEditContactPhone] = useState('');
  const [editContactEmail, setEditContactEmail] = useState('');
  const [editSector, setEditSector] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const loadProspects = useCallback(async () => {
    if (!firebaseUser) return;
    const response = await getProspects(firebaseUser);
    setProspects(response.prospects || []);
  }, [firebaseUser]);

  useEffect(() => {
    loadProspects().catch(error => {
      Alert.alert('No se pudieron cargar prospectos', error instanceof Error ? error.message : 'Intenta nuevamente.');
    }).finally(() => setLoading(false));
  }, [loadProspects]);

  const visibleProspects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const currentUserId = session?.user.id;

    const scoped = prospects.filter(prospect => {
      if (filter === 'mine') return Boolean(currentUserId) && prospect.ownerId === currentUserId;
      if (filter === 'free') return !prospect.ownerId;
      return true;
    });

    const searched = normalized
      ? scoped.filter(prospect => (
        prospect.companyName?.toLowerCase().includes(normalized)
        || prospect.contactName?.toLowerCase().includes(normalized)
        || prospect.sector?.toLowerCase().includes(normalized)
        || prospect.ownerName?.toLowerCase().includes(normalized)
      ))
      : scoped;

    return searched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [filter, prospects, query, session?.user.id]);

  const counts = useMemo(() => ({
    mine: prospects.filter(prospect => prospect.ownerId === session?.user.id).length,
    free: prospects.filter(prospect => !prospect.ownerId).length,
    all: prospects.length,
  }), [prospects, session?.user.id]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadProspects();
    } finally {
      setRefreshing(false);
    }
  };

  const openCreateModal = () => {
    setCompanyName('');
    setContactName('');
    setContactPhone('');
    setContactEmail('');
    setSector('');
    setNotes('');
    setCreateModalOpen(true);
  };

  const saveProspect = async () => {
    if (!firebaseUser) return;

    const trimmedCompanyName = companyName.trim();
    if (!trimmedCompanyName) {
      Alert.alert('Empresa obligatoria', 'Cargá el nombre del prospecto.');
      return;
    }

    setSaving(true);
    try {
      await createProspect(firebaseUser, {
        companyName: trimmedCompanyName,
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim(),
        sector: sector.trim(),
        notes: notes.trim(),
        status: 'Nuevo',
      });
      setCreateModalOpen(false);
      setFilter('mine');
      await loadProspects();
      Alert.alert('Prospecto creado', 'Quedo asignado a tu usuario.');
    } catch (error) {
      Alert.alert('No se pudo crear', error instanceof Error ? error.message : 'Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const requestClaim = async (prospect: Prospect) => {
    if (!firebaseUser) return;

    setSaving(true);
    try {
      await claimProspect(firebaseUser, prospect.id);
      await loadProspects();
      Alert.alert('Reclamo enviado', 'Quedo pendiente de aprobacion.');
    } catch (error) {
      Alert.alert('No se pudo reclamar', error instanceof Error ? error.message : 'Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (prospect: Prospect) => {
    setSelectedProspect(prospect);
    setEditStatus(prospect.status || 'Nuevo');
    setEditContactName(prospect.contactName || '');
    setEditContactPhone(prospect.contactPhone || '');
    setEditContactEmail(prospect.contactEmail || '');
    setEditSector(prospect.sector || '');
    setEditNotes(prospect.notes || '');
  };

  const saveProspectUpdate = async () => {
    if (!firebaseUser || !selectedProspect) return;

    setSaving(true);
    try {
      await updateProspect(firebaseUser, selectedProspect.id, {
        status: editStatus,
        contactName: editContactName.trim(),
        contactPhone: editContactPhone.trim(),
        contactEmail: editContactEmail.trim(),
        sector: editSector.trim(),
        notes: editNotes.trim(),
      });
      setSelectedProspect(null);
      await loadProspects();
      Alert.alert('Prospecto actualizado', 'Los cambios quedaron guardados.');
    } catch (error) {
      Alert.alert('No se pudo actualizar', error instanceof Error ? error.message : 'Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingScreen label="Cargando prospectos..." />;

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.list}
        data={visibleProspects}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text style={styles.title}>Prospectos</Text>
            <Text style={styles.subtitle}>{visibleProspects.length} visibles en esta vista.</Text>
            <View style={styles.filterRow}>
              <FilterButton active={filter === 'mine'} label={`Mios ${counts.mine}`} onPress={() => setFilter('mine')} />
              <FilterButton active={filter === 'free'} label={`Libres ${counts.free}`} onPress={() => setFilter('free')} />
              <FilterButton active={filter === 'all'} label={`Todos ${counts.all}`} onPress={() => setFilter('all')} />
            </View>
            <TextInput
              placeholder="Buscar prospecto"
              placeholderTextColor="#94a3b8"
              style={styles.search}
              value={query}
              onChangeText={setQuery}
            />
            <Pressable onPress={openCreateModal} style={styles.createButton}>
              <MaterialCommunityIcons name="account-plus-outline" size={19} color="#ffffff" />
              <Text style={styles.createButtonText}>Crear prospecto</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No hay prospectos para mostrar.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleGroup}>
                <Text style={styles.cardTitle}>{item.companyName || 'Prospecto sin nombre'}</Text>
                <Text style={styles.meta}>{item.sector || 'Sin sector'} - {formatDate(item.createdAt)}</Text>
              </View>
              <Text style={[styles.status, getStatusStyle(item.status)]}>{item.status || 'Nuevo'}</Text>
            </View>

            {!!item.contactName && <Text style={styles.meta}>Contacto: {item.contactName}</Text>}
            {!!item.ownerName && <Text style={styles.meta}>Asesor: {item.ownerName}</Text>}
            {!!item.claimStatus && <Text style={styles.claim}>Reclamo pendiente: {item.claimantName || '-'}</Text>}
            {!!item.notes && <Text style={styles.notes}>{item.notes}</Text>}

            <View style={styles.actionsRow}>
              {!!item.contactPhone && (
                <Pressable onPress={() => openLink(`tel:${item.contactPhone}`, 'No se pudo iniciar la llamada.')} style={styles.secondaryAction}>
                  <MaterialCommunityIcons name="phone-outline" size={18} color="#0f172a" />
                  <Text style={styles.secondaryActionText}>Llamar</Text>
                </Pressable>
              )}
              {!!item.contactEmail && (
                <Pressable onPress={() => openLink(`mailto:${item.contactEmail}`, 'No se pudo abrir el correo.')} style={styles.secondaryAction}>
                  <MaterialCommunityIcons name="email-outline" size={18} color="#0f172a" />
                  <Text style={styles.secondaryActionText}>Mail</Text>
                </Pressable>
              )}
              {!item.ownerId && !item.claimStatus && (
                <Pressable disabled={saving} onPress={() => requestClaim(item)} style={styles.claimButton}>
                  <Text style={styles.claimButtonText}>Reclamar</Text>
                </Pressable>
              )}
              {item.ownerId === session?.user.id && (
                <Pressable disabled={saving} onPress={() => openEditModal(item)} style={styles.claimButton}>
                  <Text style={styles.claimButtonText}>Editar</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      />

      <Modal visible={createModalOpen} transparent animationType="fade" onRequestClose={() => setCreateModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Crear prospecto</Text>
            <TextInput placeholder="Empresa" placeholderTextColor="#94a3b8" style={styles.input} value={companyName} onChangeText={setCompanyName} />
            <TextInput placeholder="Contacto" placeholderTextColor="#94a3b8" style={styles.input} value={contactName} onChangeText={setContactName} />
            <TextInput placeholder="Telefono" placeholderTextColor="#94a3b8" style={styles.input} value={contactPhone} onChangeText={setContactPhone} />
            <TextInput placeholder="Email" placeholderTextColor="#94a3b8" style={styles.input} value={contactEmail} onChangeText={setContactEmail} />
            <TextInput placeholder="Sector" placeholderTextColor="#94a3b8" style={styles.input} value={sector} onChangeText={setSector} />
            <TextInput
              multiline
              placeholder="Notas"
              placeholderTextColor="#94a3b8"
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
            />
            <View style={styles.modalActions}>
              <Pressable disabled={saving} onPress={() => setCreateModalOpen(false)} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable disabled={saving} onPress={saveProspect} style={[styles.saveButton, saving && styles.disabledButton]}>
                <Text style={styles.saveButtonText}>{saving ? 'Guardando...' : 'Guardar'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(selectedProspect)} transparent animationType="fade" onRequestClose={() => setSelectedProspect(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Editar prospecto</Text>
            <Text style={styles.modalSubtitle}>{selectedProspect?.companyName || 'Prospecto'}</Text>

            <View style={styles.statusGrid}>
              {statusOptions.map(status => (
                <Pressable
                  key={status}
                  onPress={() => setEditStatus(status)}
                  style={[styles.statusOption, editStatus === status && styles.statusOptionActive]}
                >
                  <Text style={[styles.statusOptionText, editStatus === status && styles.statusOptionTextActive]}>{status}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput placeholder="Contacto" placeholderTextColor="#94a3b8" style={styles.input} value={editContactName} onChangeText={setEditContactName} />
            <TextInput placeholder="Telefono" placeholderTextColor="#94a3b8" style={styles.input} value={editContactPhone} onChangeText={setEditContactPhone} />
            <TextInput placeholder="Email" placeholderTextColor="#94a3b8" style={styles.input} value={editContactEmail} onChangeText={setEditContactEmail} />
            <TextInput placeholder="Sector" placeholderTextColor="#94a3b8" style={styles.input} value={editSector} onChangeText={setEditSector} />
            <TextInput
              multiline
              placeholder="Notas"
              placeholderTextColor="#94a3b8"
              style={styles.notesInput}
              value={editNotes}
              onChangeText={setEditNotes}
            />

            <View style={styles.modalActions}>
              <Pressable disabled={saving} onPress={() => setSelectedProspect(null)} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable disabled={saving} onPress={saveProspectUpdate} style={[styles.saveButton, saving && styles.disabledButton]}>
                <Text style={styles.saveButtonText}>{saving ? 'Guardando...' : 'Guardar'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FilterButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.filterButton, active && styles.filterButtonActive]}>
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  list: {
    padding: 18,
    gap: 12,
  },
  header: {
    gap: 10,
    marginBottom: 4,
  },
  title: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    color: '#64748b',
    fontSize: 14,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 9,
  },
  filterButtonActive: {
    borderColor: '#0f172a',
    backgroundColor: '#0f172a',
  },
  filterText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '900',
  },
  filterTextActive: {
    color: '#ffffff',
  },
  search: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    color: '#0f172a',
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
  },
  createButtonText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  empty: {
    color: '#64748b',
    textAlign: 'center',
    marginTop: 36,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 14,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardTitleGroup: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
  },
  meta: {
    color: '#64748b',
    fontSize: 12,
  },
  notes: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
  },
  claim: {
    color: '#92400e',
    fontSize: 12,
    fontWeight: '900',
  },
  status: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '900',
  },
  statusNew: {
    backgroundColor: '#f1f5f9',
    color: '#334155',
  },
  statusContacted: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
  },
  statusQualified: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  statusConverted: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  statusLost: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  secondaryActionText: {
    color: '#0f172a',
    fontWeight: '900',
  },
  claimButton: {
    borderRadius: 10,
    backgroundColor: '#0f172a',
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  claimButtonText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    padding: 18,
  },
  modalCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    padding: 18,
    gap: 10,
  },
  modalTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '900',
  },
  modalSubtitle: {
    color: '#64748b',
    fontSize: 13,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusOption: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  statusOptionActive: {
    borderColor: '#0f172a',
    backgroundColor: '#0f172a',
  },
  statusOptionText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '900',
  },
  statusOptionTextActive: {
    color: '#ffffff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    color: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  notesInput: {
    minHeight: 92,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    color: '#0f172a',
    padding: 12,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  cancelButtonText: {
    color: '#0f172a',
    fontWeight: '900',
  },
  saveButton: {
    borderRadius: 999,
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  saveButtonText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.65,
  },
});
