import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { Appointment, AppointmentStatus } from '@opd/shared';
import { cancelAppointment, listMyAppointments } from '../api/appointments';
import { colors } from '../theme';

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  BOOKED: 'Booked',
  CHECKED_IN: 'Checked In',
  IN_CONSULTATION: 'In Consultation',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No Show',
};

export function MyAppointmentsScreen() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMyAppointments();
      setAppointments(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleCancel(id: string) {
    await cancelAppointment(id);
    load();
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={appointments}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      ListEmptyComponent={!loading ? <Text style={styles.empty}>No appointments yet.</Text> : null}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View>
              <Text style={styles.doctorName}>{item.doctor?.user.name}</Text>
              <Text style={styles.meta}>
                {item.doctor?.specialization} · {item.date}
              </Text>
            </View>
            <Text style={styles.token}>#{item.tokenNumber}</Text>
          </View>
          <Text style={styles.status}>{STATUS_LABEL[item.status]}</Text>
          {item.status === 'BOOKED' && item.date >= today && (
            <Pressable onPress={() => handleCancel(item.id)}>
              <Text style={styles.cancel}>Cancel appointment</Text>
            </Pressable>
          )}
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
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  doctorName: { fontSize: 16, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  token: { fontSize: 22, fontWeight: '700', color: colors.gold },
  status: { marginTop: 8, fontSize: 13, color: colors.teal, fontWeight: '500' },
  cancel: { marginTop: 8, fontSize: 13, color: '#dc2626' },
});
