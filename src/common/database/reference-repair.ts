import { Connection, Model, SchemaType } from 'mongoose';

const objectIdPattern = /^[a-fA-F0-9]{24}$/;
const converted = (value: string) => ({
  $convert: { input: value, to: 'objectId', onError: value, onNull: value },
});

function referenceFields(model: Model<any>) {
  return Object.entries(
    model.schema.paths as Record<string, SchemaType>,
  ).flatMap(([field, path]) => {
    if (field === '_id') return [];
    if (path.instance === 'ObjectId') return [{ field, array: false }];
    if (
      path.instance === 'Array' &&
      path.getEmbeddedSchemaType()?.instance === 'ObjectId'
    )
      return [{ field, array: true }];
    return [];
  });
}

export async function inspectReferences(connection: Connection) {
  const report: Array<{
    collection: string;
    field: string;
    convertible: number;
    invalid: number;
    collisions: number;
  }> = [];
  for (const model of Object.values(connection.models)) {
    const fields = referenceFields(model);
    if (!fields.length) continue;
    let collisions = 0;
    for (const [index, options] of model.schema.indexes()) {
      if (
        !options.unique ||
        !Object.keys(index as Record<string, unknown>).some((key) =>
          fields.some((f) => f.field === key),
        )
      )
        continue;
      const key = Object.fromEntries(
        Object.keys(index as Record<string, unknown>).map((field) => [
          field.replaceAll('.', '_'),
          fields.some((f) => f.field === field)
            ? converted(`$${field}`)
            : `$${field}`,
        ]),
      );
      const matches =
        options.partialFilterExpression ??
        (options.sparse
          ? Object.fromEntries(
              Object.keys(index as Record<string, unknown>).map((field) => [
                field,
                { $exists: true },
              ]),
            )
          : {});
      const duplicates = await model.collection
        .aggregate([
          { $match: matches },
          { $group: { _id: key, count: { $sum: 1 } } },
          { $match: { count: { $gt: 1 } } },
          { $count: 'count' },
        ])
        .toArray();
      collisions += duplicates[0]?.count ?? 0;
    }
    for (const { field, array } of fields) {
      const pipeline: any[] = array ? [{ $unwind: `$${field}` }] : [];
      pipeline.push(
        { $project: { value: `$${field}`, kind: { $type: `$${field}` } } },
        { $match: { kind: { $nin: ['objectId', 'null', 'missing'] } } },
      );
      const values = await model.collection
        .aggregate([
          ...pipeline,
          {
            $group: {
              _id: null,
              convertible: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$kind', 'string'] },
                        {
                          $regexMatch: {
                            input: {
                              $cond: [
                                { $eq: ['$kind', 'string'] },
                                '$value',
                                '',
                              ],
                            },
                            regex: objectIdPattern,
                          },
                        },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              total: { $sum: 1 },
            },
          },
        ])
        .toArray();
      const convertible = values[0]?.convertible ?? 0;
      report.push({
        collection: model.collection.name,
        field,
        convertible,
        invalid: (values[0]?.total ?? 0) - convertible,
        collisions,
      });
    }
  }
  return report;
}

export type ReferenceBackup = {
  collection: string;
  id: unknown;
  field: string;
  value: unknown;
};

export async function normalizeReferences(
  connection: Connection,
  beforeApply?: (backup: ReferenceBackup[]) => void | Promise<void>,
) {
  const report = await inspectReferences(connection);
  if (report.some((r) => r.collisions))
    throw new Error(
      'Reference collision detected; no records changed. Review the report before merging any records.',
    );
  if (report.some((r) => r.invalid))
    throw new Error(
      'Invalid historical references detected; no records changed. Review the report.',
    );
  await connection.transaction(async (session) => {
    if (beforeApply) {
      const backup: ReferenceBackup[] = [];
      for (const item of report.filter((r) => r.convertible > 0)) {
        const model = Object.values(connection.models).find(
          (m) => m.collection.name === item.collection,
        )!;
        const field = referenceFields(model).find(
          (f) => f.field === item.field,
        )!;
        const filter = field.array
          ? {
              [field.field]: {
                $elemMatch: { $type: 'string', $regex: objectIdPattern },
              },
            }
          : { [field.field]: { $type: 'string', $regex: objectIdPattern } };
        const docs = await model.collection
          .find(filter, { projection: { _id: 1, [field.field]: 1 }, session })
          .toArray();
        for (const doc of docs)
          backup.push({
            collection: item.collection,
            id: doc._id,
            field: item.field,
            value: doc[item.field],
          });
      }
      await beforeApply(backup);
    }
    for (const model of Object.values(connection.models)) {
      for (const { field, array } of referenceFields(model)) {
        const match = array
          ? {
              [field]: {
                $elemMatch: { $type: 'string', $regex: objectIdPattern },
              },
            }
          : { [field]: { $type: 'string', $regex: objectIdPattern } };
        const value = array
          ? { $map: { input: `$${field}`, as: 'id', in: converted('$$id') } }
          : converted(`$${field}`);
        await model.collection.updateMany(
          match,
          [{ $set: { [field]: value } }],
          { session },
        );
      }
    }
  });
}
