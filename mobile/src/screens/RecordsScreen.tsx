import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { Appointment } from '@opd/shared';
import { getPatientRecords } from '../api/patients';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

export function RecordsScreen() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getPatientRecords(user.id);
      setAppointments(data.appointments.filter((a) => a.consultation));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={appointments}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      ListEmptyComponent={!loading ? <Text style={styles.empty}>No medical records yet.</Text> : null}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.doctorName}>{item.doctor?.user.name}</Text>
          <Text style={styles.meta}>{item.date}</Text>
          {item.consultation?.diagnosis && (
            <Text style={styles.diagnosis}>Diagnosis: {item.consultation.diagnosis}</Text>
          )}
          {item.consultation?.notes && <Text style={styles.notes}>{item.consultation.notes}</Text>}
          {item.consultation?.prescriptions.map((p) => (
            <Text key={p.id} style={styles.prescription}>
              • {p.medicine} — {p.dosage}, {p.frequency}, {p.durationDays} days
            </Text>
          ))}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.tealLight,
  },
  doctorName: { fontSize: 16, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 13, color: colors.muted, marginBottom: 8 },
  diagnosis: { fontSize: 14, fontWeight: '500', color: colors.ink, marginTop: 4 },
  notes: { fontSize: 13, color: colors.muted, marginTop: 4 },
  prescription: { fontSize: 13, color: colors.ink, marginTop: 4 },
});
