import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Appointment, LabInvoice, PharmacySale, RadiologyInvoice } from '@opd/shared';
import { getPatientRecords } from '../api/patients';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

export function RecordsScreen() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [pharmacySales, setPharmacySales] = useState<PharmacySale[]>([]);
  const [labInvoices, setLabInvoices] = useState<LabInvoice[]>([]);
  const [radiologyInvoices, setRadiologyInvoices] = useState<RadiologyInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getPatientRecords(user.id);
      setAppointments(data.appointments.filter((a) => a.consultation));
      setPharmacySales(data.pharmacySales);
      setLabInvoices(data.labInvoices);
      setRadiologyInvoices(data.radiologyInvoices);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const hasNothing =
    appointments.length === 0 &&
    pharmacySales.length === 0 &&
    labInvoices.length === 0 &&
    radiologyInvoices.length === 0;

  return (
    <ScrollView
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      {!loading && hasNothing && <Text style={styles.empty}>No medical records yet.</Text>}

      {appointments.map((item) => (
        <View key={item.id} style={styles.card}>
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
          {item.consultation?.labTestsOrdered.map((o) => (
            <Text key={o.id} style={styles.prescription}>
              • Lab: {o.testName}
            </Text>
          ))}
          {item.consultation?.radiologyOrdered.map((o) => (
            <Text key={o.id} style={styles.prescription}>
              • Radiology: {o.testName}
            </Text>
          ))}
        </View>
      ))}

      {pharmacySales.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Pharmacy Purchases</Text>
          {pharmacySales.map((sale) => (
            <View key={sale.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.meta}>{new Date(sale.createdAt).toLocaleDateString()}</Text>
                <Text style={styles.total}>₹{sale.total.toFixed(2)}</Text>
              </View>
              {sale.items.map((item) => (
                <Text key={item.id} style={styles.prescription}>
                  • {item.medicineName} × {item.quantity}
                </Text>
              ))}
            </View>
          ))}
        </>
      )}

      {labInvoices.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Lab Results</Text>
          {labInvoices.map((invoice) => (
            <View key={invoice.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.meta}>{new Date(invoice.createdAt).toLocaleDateString()}</Text>
                <Text style={styles.total}>₹{invoice.total.toFixed(2)}</Text>
              </View>
              {invoice.items.map((item) => (
                <Text key={item.id} style={styles.prescription}>
                  • {item.testName}
                  {item.resultText ? `: ${item.resultText}` : ''}
                </Text>
              ))}
            </View>
          ))}
        </>
      )}

      {radiologyInvoices.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Radiology Results</Text>
          {radiologyInvoices.map((invoice) => (
            <View key={invoice.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.meta}>{new Date(invoice.createdAt).toLocaleDateString()}</Text>
                <Text style={styles.total}>₹{invoice.total.toFixed(2)}</Text>
              </View>
              {invoice.items.map((item) => (
                <Text key={item.id} style={styles.prescription}>
                  • {item.testName}
                  {item.resultText ? `: ${item.resultText}` : ''}
                </Text>
              ))}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: 8, marginBottom: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.tealLight,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  doctorName: { fontSize: 16, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 13, color: colors.muted, marginBottom: 8 },
  total: { fontSize: 14, fontWeight: '700', color: colors.ink },
  diagnosis: { fontSize: 14, fontWeight: '500', color: colors.ink, marginTop: 4 },
  notes: { fontSize: 13, color: colors.muted, marginTop: 4 },
  prescription: { fontSize: 13, color: colors.ink, marginTop: 4 },
});
